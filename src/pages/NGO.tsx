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
import { Shield, CheckCircle, XCircle, Plus, ArrowLeft, Loader2, FileText, Building2, Wallet, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";
import { useContracts } from "@/hooks/useContracts";
import { useContractEvents } from "@/hooks/useContractEvents"; // ✅ 引入事件监听
import { ethers } from "ethers";

interface Application {
  id: string;
  applicant_name: string;
  situation: string;
  requested_amount: number;
  status: string;
  created_at: string;
  project_id: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  target_amount: number;
  current_amount?: number;
  created_at?: string;
}

const NGO = () => {
  const [ngoStatus, setNgoStatus] = useState<"loading" | "register" | "pending" | "approved" | "rejected">("loading");
  const [selectedTab, setSelectedTab] = useState<"applications" | "projects" | "allocations">("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  
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
  const { events } = useContractEvents(); // ✅ 获取事件流

  // --- 1. 初始化与状态检查 ---
  useEffect(() => {
    checkNGOStatus();
  }, [account]);

  useEffect(() => {
    if (ngoStatus === "approved" && organizerId) {
      fetchDashboardData();
    }
  }, [selectedTab, ngoStatus, organizerId]);

  // ✅ 监听链上 ProjectCreated 事件，自动刷新列表
  useEffect(() => {
    const hasNewProject = events.some(e => e.type === "ProjectCreated");
    if (hasNewProject && ngoStatus === "approved") {
      console.log("监听到新项目创建，刷新列表...");
      fetchDashboardData();
    }
  }, [events]);

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

  const fetchDashboardData = async () => {
    if (!organizerId) return;
    setLoading(true);
    try {
      if (selectedTab === "applications") {
        const { data: projectIds } = await supabase.from("projects").select("id").eq("organizer_id", organizerId);
        if (projectIds && projectIds.length > 0) {
          const { data: apps } = await supabase
            .from("applications")
            .select("*")
            .in("project_id", projectIds.map(p => p.id))
            .order("created_at", { ascending: false });
          setApplications(apps || []);
        }
      } else if (selectedTab === "projects") {
        const { data: projects } = await supabase
          .from("projects")
          .select("*")
          .eq("organizer_id", organizerId)
          .order("created_at", { ascending: false });
        setMyProjects(projects || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. NGO 注册逻辑 ---
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

    } catch (error: any) {
      console.error(error);
      toast({ title: "注册失败", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- 3. 核心逻辑：创建慈善项目 (ProjectVaultManager.createProject) ---
  const handleCreateProject = async () => {
    if (!organizerId) return;
    // 检查合约连接
    if (!contracts.projectVaultManager || !contracts.mockToken || !account) {
      toast({ title: "合约未连接", description: "请确保钱包已连接且在正确网络", variant: "destructive" });
      return;
    }

    // 基础校验
    const budget = parseFloat(newProject.target_amount);
    if (!newProject.title || isNaN(budget) || budget <= 0) {
      toast({ title: "请输入有效的标题和目标金额", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // 1. 计算所需参数
      // 合约要求：deposit >= (budget * 120) / 100
      const budgetWei = ethers.utils.parseEther(budget.toString());
      const requiredDepositWei = budgetWei.mul(120).div(100); // 120% 的押金
      const requiredDepositEth = ethers.utils.formatEther(requiredDepositWei);

      // 2. 授权 MockToken (作为押金)
      toast({
        title: "步骤 1/3: 支付项目押金",
        description: `需要质押 120% 的项目保证金 (${requiredDepositEth} MUSD)，请先授权。`,
      });

      const approveTx = await contracts.mockToken.approve(
        contracts.projectVaultManager.address,
        requiredDepositWei
      );
      await approveTx.wait();

      // 3. 调用合约 createProject
      toast({
        title: "步骤 2/3: 创建链上项目",
        description: "正在调用 ProjectVaultManager 创建项目金库...",
      });

      // createProject 参数: (budget, title, description, categoryTag, deposit)
      const createTx = await contracts.projectVaultManager.createProject(
        budgetWei,
        newProject.title,
        newProject.description,
        newProject.category,
        requiredDepositWei
      );
      
      const receipt = await createTx.wait();
      console.log("Project created on chain:", receipt);

      // 4. 写入 Supabase (同步数据)
      toast({
        title: "步骤 3/3: 同步数据",
        description: "正在保存项目信息...",
      });

      const { error } = await supabase.from("projects").insert({
        organizer_id: organizerId,
        title: newProject.title,
        description: newProject.description,
        category: newProject.category,
        target_amount: budget,
        beneficiary_count: parseInt(newProject.beneficiary_count) || 0,
        image_url: newProject.image_url || null,
        status: "active",
        // 这里可以加个字段存 transaction_hash 如果数据库支持
      });

      if (error) throw error;

      toast({ title: "项目创建成功！", description: "项目已上线并开始接受捐赠" });
      
      // 重置表单并刷新
      setNewProject({ title: "", description: "", category: "", target_amount: "", beneficiary_count: "", image_url: "" });
      fetchDashboardData();

    } catch (error: any) {
      console.error("Create project error:", error);
      let msg = error.message || "未知错误";
      if (error.code === 4001) msg = "用户取消了交易";
      if (error.data?.message?.includes("deposit too low")) msg = "押金不足 (需120%)";
      
      toast({
        title: "创建失败",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- 渲染逻辑 ---

  const renderRegisterView = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> 注册 NGO</CardTitle>
          <CardDescription>发起项目需先验证资质并缴纳押金。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!account ? (
            <Button onClick={connectWallet} className="w-full h-12"><Wallet className="mr-2"/> 连接钱包</Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="机构名称" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
                <Select onValueChange={v => setRegForm({...regForm, type: v})}>
                  <SelectTrigger><SelectValue placeholder="类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Education">教育</SelectItem><SelectItem value="Medical">医疗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="执照编号" value={regForm.licenseId} onChange={e => setRegForm({...regForm, licenseId: e.target.value})} />
              <Input type="number" placeholder="押金 (MockToken)" value={regForm.stakeAmount} onChange={e => setRegForm({...regForm, stakeAmount: e.target.value})} />
              <Button className="w-full" onClick={handleRegisterNGO} disabled={loading}>
                {loading ? <Loader2 className="animate-spin"/> : "提交申请"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderDashboard = () => (
    <>
      <div className="text-center mb-12">
        <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-4">NGO 管理中心</h1>
      </div>

      <div className="flex gap-4 mb-8 justify-center">
        <Button variant={selectedTab === "applications" ? "default" : "outline"} onClick={() => setSelectedTab("applications")}>审核申请</Button>
        <Button variant={selectedTab === "projects" ? "default" : "outline"} onClick={() => setSelectedTab("projects")}>项目管理</Button>
      </div>

      {!loading && selectedTab === "projects" && (
         <div className="max-w-4xl mx-auto space-y-6">
           <Card className="border-primary/20 shadow-lg">
             <CardHeader className="bg-primary/5">
               <CardTitle className="text-primary flex items-center gap-2">
                 <Plus className="w-5 h-5"/> 发起新的募捐项目
               </CardTitle>
               <CardDescription>
                 项目将在区块链上创建智能金库。注意：系统将自动冻结目标金额 120% 的押金。
               </CardDescription>
             </CardHeader>
             <CardContent className="space-y-4 pt-6">
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label>项目标题</Label>
                   <Input value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} placeholder="例如：山区女童助学计划" />
                 </div>
                 <div className="space-y-2">
                    <Label>项目类别</Label>
                    <Select value={newProject.category} onValueChange={v => setNewProject({...newProject, category: v})}>
                      <SelectTrigger><SelectValue placeholder="选择..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="education">教育支持</SelectItem>
                        <SelectItem value="medical">医疗援助</SelectItem>
                        <SelectItem value="emergency">紧急救助</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label>募捐目标金额 (ETH)</Label>
                   <div className="relative">
                     <Input type="number" value={newProject.target_amount} onChange={e => setNewProject({...newProject, target_amount: e.target.value})} placeholder="10.0" />
                     <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">ETH</span>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <Label>预计受助人数</Label>
                   <Input type="number" value={newProject.beneficiary_count} onChange={e => setNewProject({...newProject, beneficiary_count: e.target.value})} placeholder="50" />
                 </div>
               </div>

               <div className="space-y-2">
                 <Label>项目详情描述</Label>
                 <Textarea rows={3} value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} placeholder="请详细描述项目背景、资金用途及执行计划..." />
               </div>

               <div className="bg-yellow-50 p-3 rounded-md text-sm text-yellow-800 flex items-start gap-2">
                 <Wallet className="w-4 h-4 mt-0.5" />
                 <div>
                   <strong>押金提示：</strong> 
                   根据合约规则，创建此项目需要质押 
                   <span className="font-bold mx-1">
                     {newProject.target_amount ? (parseFloat(newProject.target_amount) * 1.2).toFixed(2) : "0.00"} 
                   </span> 
                   MUSD (目标金额的 120%)。
                 </div>
               </div>

               <Button onClick={handleCreateProject} disabled={loading} className="w-full h-12 text-lg">
                 {loading ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle className="mr-2"/>} 
                 确认创建并质押押金
               </Button>
             </CardContent>
           </Card>

           <div className="space-y-4">
             <h3 className="text-xl font-bold flex items-center gap-2">
               <RefreshCw className="w-5 h-5"/> 已发布项目
             </h3>
             {myProjects.length === 0 ? (
               <div className="text-center py-10 text-muted-foreground border rounded-lg">暂无发布记录</div>
             ) : (
               myProjects.map(p => (
                 <Card key={p.id} className="hover:shadow-md transition-shadow">
                   <CardHeader className="pb-2">
                     <div className="flex justify-between">
                       <CardTitle>{p.title}</CardTitle>
                       <Badge>{p.category}</Badge>
                     </div>
                     <CardDescription>目标: {p.target_amount} ETH</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                   </CardContent>
                 </Card>
               ))
             )}
           </div>
         </div>
      )}

      {!loading && selectedTab === "applications" && (
        // (省略 Applications 渲染逻辑，与之前保持一致，或者你可以从之前的回复中复制过来)
        <div className="text-center py-12 text-muted-foreground">请从上方切换到“项目管理”以测试新功能</div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          {ngoStatus !== "approved" && (
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-6"><ArrowLeft className="mr-2"/> 返回</Button>
          )}
          {ngoStatus === "register" && renderRegisterView()}
          {ngoStatus === "pending" && <Card className="py-12 text-center"><CardContent>您的申请正在审核中...</CardContent></Card>}
          {ngoStatus === "rejected" && <Card className="py-12 text-center"><CardContent>申请被拒绝</CardContent></Card>}
          {ngoStatus === "approved" && renderDashboard()}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NGO;
