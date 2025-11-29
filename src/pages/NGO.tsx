import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle, XCircle, Plus, ArrowLeft, Loader2, FileText, Building2, Wallet, RefreshCw, Eye, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";
import { useContracts } from "@/hooks/useContracts";
import { useContractEvents } from "@/hooks/useContractEvents";
import { ethers } from "ethers";

// --- 类型定义 ---

interface Application {
  id: string;
  applicant_name: string;
  situation: string;
  requested_amount: number;
  status: string;
  created_at: string;
  project_id: string | null;
}

// 链上项目结构
interface ChainProject {
  id: number;
  title: string;
  description: string;
  category: string;
  budget: string;          // 目标金额 (ETH)
  donatedAmount: string;   // 已捐赠 (ETH)
  remainingFunds: string;  // 剩余可用 (ETH)
  deposit: string;         // 押金 (ETH)
  status: number;          // 0:None, 1:Active, 2:Closed
  ngo: string;
}

// 资金分配记录
interface AllocationRecord {
  beneficiary: string;
  amount: string;
  timestamp: string;
  txHash: string;
}

const NGO = () => {
  const [ngoStatus, setNgoStatus] = useState<"loading" | "register" | "pending" | "approved" | "rejected">("loading");
  const [selectedTab, setSelectedTab] = useState<"applications" | "projects" | "allocations">("applications");
  
  const [applications, setApplications] = useState<Application[]>([]);
  const [chainProjects, setChainProjects] = useState<ChainProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);

  // 详情弹窗状态
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ChainProject | null>(null);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // 注册表单
  const [regForm, setRegForm] = useState({
    name: "",
    type: "",
    licenseId: "",
    email: "",
    phone: "",
    description: "",
    stakeAmount: "100", 
  });

  // 项目创建表单
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    category: "",
    target_amount: "",
    beneficiary_count: "",
    image_url: "",
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const { account, connectWallet } = useWeb3();
  const contracts = useContracts();
  const { events } = useContractEvents();

  // --- 1. 初始化 ---
  useEffect(() => {
    checkNGOStatus();
  }, [account]);

  useEffect(() => {
    if (ngoStatus === "approved") {
      if (selectedTab === "applications") fetchApplications();
      if (selectedTab === "projects") fetchChainProjects();
    }
  }, [selectedTab, ngoStatus, organizerId, contracts.projectVaultManager]);

  // 监听链上事件自动刷新
  useEffect(() => {
    // 监听创建项目或分配资金事件
    const shouldRefresh = events.some(e => 
      e.type === "ProjectCreated" || 
      e.type === "ProjectFundsAllocatedToBeneficiary" || 
      e.type === "ProjectDonationReceived"
    );

    if (shouldRefresh && ngoStatus === "approved") {
      if (selectedTab === "projects") fetchChainProjects();
      // 如果正在查看详情，也刷新详情里的分配记录
      if (detailsOpen && selectedProject) handleShowDetails(selectedProject);
    }
  }, [events]);

  // --- 数据获取 ---

  const checkNGOStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNgoStatus("register");
        return;
      }

      const { data: organizer } = await supabase
        .from("organizers")
        .select("id, status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!organizer) {
        setNgoStatus("register");
      } else {
        setNgoStatus(organizer.status as any);
        setOrganizerId(organizer.id);
      }
    } catch (error) {
      console.error("Check status error:", error);
      setNgoStatus("register");
    }
  };

  const fetchApplications = async () => {
    if (!organizerId) return;
    setLoading(true);
    try {
      const { data: projectIds } = await supabase.from("projects").select("id").eq("organizer_id", organizerId);
      if (projectIds && projectIds.length > 0) {
        const { data: apps } = await supabase
          .from("applications")
          .select("*")
          .in("project_id", projectIds.map(p => p.id))
          .order("created_at", { ascending: false });
        setApplications(apps || []);
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ 获取链上项目列表 (根据 ProjectCreated 事件)
  const fetchChainProjects = async () => {
    if (!contracts.projectVaultManager || !account) return;
    setLoading(true);
    try {
      // 1. 过滤出当前 NGO 创建的所有 ProjectCreated 事件
      // filter: ProjectCreated(uint256 indexed projectId, address indexed ngoAddr, ...)
      const filter = contracts.projectVaultManager.filters.ProjectCreated(null, account);
      const logs = await contracts.projectVaultManager.queryFilter(filter);
      
      const loadedProjects: ChainProject[] = [];

      // 2. 遍历事件，根据 ID 查询最新状态
      for (const log of logs) {
        const pid = log.args?.projectId;
        if (pid !== undefined) {
          const pData = await contracts.projectVaultManager.projects(pid);
          // Struct: id, ngoAddr, manager, budget, deposit, donatedAmount, remainingFunds, status, title...
          loadedProjects.push({
            id: pData.id.toNumber(),
            title: pData.title,
            description: pData.description,
            category: pData.categoryTag,
            budget: ethers.utils.formatEther(pData.budget),
            donatedAmount: ethers.utils.formatEther(pData.donatedAmount),
            remainingFunds: ethers.utils.formatEther(pData.remainingFunds),
            deposit: ethers.utils.formatEther(pData.deposit),
            status: pData.status, // 1=Active
            ngo: pData.ngoAddr
          });
        }
      }
      // 按 ID 倒序排列
      setChainProjects(loadedProjects.sort((a, b) => b.id - a.id));
    } catch (error) {
      console.error("Fetch chain projects error:", error);
      toast({ title: "获取链上数据失败", description: "请检查网络连接", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ✅ 获取项目详情 & 资金分配记录
  const handleShowDetails = async (project: ChainProject) => {
    setSelectedProject(project);
    setDetailsOpen(true);
    setLoadingDetails(true);

    if (!contracts.projectVaultManager) return;

    try {
      // 1. 重新获取该项目的最新资金状态 (防止列表数据滞后)
      const pData = await contracts.projectVaultManager.projects(project.id);
      setSelectedProject({
        ...project,
        donatedAmount: ethers.utils.formatEther(pData.donatedAmount),
        remainingFunds: ethers.utils.formatEther(pData.remainingFunds),
      });

      // 2. 查询资金分配事件 (ProjectFundsAllocatedToBeneficiary)
      // event ProjectFundsAllocatedToBeneficiary(uint256 indexed projectId, address indexed beneficiary, uint256 amount, uint256 timestamp);
      const filter = contracts.projectVaultManager.filters.ProjectFundsAllocatedToBeneficiary(project.id);
      const logs = await contracts.projectVaultManager.queryFilter(filter);

      const records: AllocationRecord[] = logs.map(log => ({
        beneficiary: log.args?.beneficiary || "",
        amount: ethers.utils.formatEther(log.args?.amount || 0),
        timestamp: new Date((log.args?.timestamp.toNumber() || 0) * 1000).toLocaleString(),
        txHash: log.transactionHash
      })).reverse(); // 最新的在前面

      setAllocations(records);

    } catch (error) {
      console.error("Fetch details error:", error);
      toast({ title: "获取详情失败", variant: "destructive" });
    } finally {
      setLoadingDetails(false);
    }
  };

  // --- 操作逻辑 ---

  const handleRegisterNGO = async () => {
    if (!account || !contracts.ngoRegistry || !contracts.mockToken) return;
    if (!regForm.name || !regForm.licenseId || !regForm.stakeAmount) {
      toast({ title: "信息不完整", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const stakeWei = ethers.utils.parseEther(regForm.stakeAmount);

      toast({ title: "步骤 1/3", description: "正在授权支付押金..." });
      const approveTx = await contracts.mockToken.approve(contracts.ngoRegistry.address, stakeWei);
      await approveTx.wait();

      toast({ title: "步骤 2/3", description: "正在链上注册..." });
      const registerTx = await contracts.ngoRegistry.registerNGO(regForm.name, regForm.licenseId, stakeWei);
      await registerTx.wait();

      toast({ title: "步骤 3/3", description: "提交审核申请..." });
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("organizers").insert({
        user_id: user?.id,
        organization_name: regForm.name,
        organization_type: regForm.type || "General",
        registration_number: regForm.licenseId,
        contact_email: regForm.email,
        contact_phone: regForm.phone,
        description: regForm.description,
        status: "pending"
      });

      toast({ title: "注册成功", description: "申请已提交，请等待平台管理员审核" });
      setNgoStatus("pending");
    } catch (error: any)
