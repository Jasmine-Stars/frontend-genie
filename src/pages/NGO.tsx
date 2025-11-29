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

// Supabase 中的项目结构
interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  target_amount: number;
  current_amount?: number;
  beneficiary_count?: number;
  created_at?: string;
  image_url?: string | null;
}

// 链上详情数据结构
interface ChainDetails {
  id: number;
  donatedAmount: string;
  remainingFunds: string;
  budget: string;
  allocations: {
    beneficiary: string;
    amount: string;
    timestamp: string;
    txHash: string;
  }[];
}

const NGO = () => {
  const [ngoStatus, setNgoStatus] = useState<"loading" | "register" | "pending" | "approved" | "rejected">("loading");
  const [selectedTab, setSelectedTab] = useState<"applications" | "projects" | "allocations">("applications");
  
  const [applications, setApplications] = useState<Application[]>([]);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);

  // 详情弹窗状态
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [chainDetails, setChainDetails] = useState<ChainDetails | null>(null);
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
    if (ngoStatus === "approved" && organizerId) {
      fetchData();
    }
  }, [selectedTab, ngoStatus, organizerId]);

  // 监听链上事件以实时更新详情
  useEffect(() => {
    const relevantEvents = ["ProjectDonationReceived", "ProjectFundsAllocatedToBeneficiary"];
    const hasUpdate = events.some(e => relevantEvents.includes(e.type));
    
    if (hasUpdate && detailsOpen && selectedProject) {
      console.log("监听到资金变动，刷新详情...");
      fetchChainDetails(selectedProject);
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

  const fetchData = async () => {
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

  // ✅ 获取链上详情 (核心逻辑)
  const handleOpenDetails = (project: Project) => {
    setSelectedProject(project);
    setDetailsOpen(true);
    fetchChainDetails(project);
  };

  const fetchChainDetails = async (project: Project) => {
    if (!contracts.projectVaultManager) return;
    setLoadingDetails(true);
    
    try {
      let chainId: number | undefined;

      // 1. 尝试在链上寻找对应的 Project ID
      const filter = contracts.projectVaultManager.filters.ProjectCreated(); 
      const logs = await contracts.projectVaultManager.queryFilter(filter);
      
      // 2. 通过标题匹配
      const targetLog = logs.find(log => log.args?.title === project.title);
      
      if (targetLog) {
        chainId = targetLog.args?.projectId.toNumber();
      } else {
        // 兜底逻辑：如果标题匹配失败，尝试检查 ID 0
        try {
          const p0 = await contracts.projectVaultManager.projects(0);
          if (p0.title === project.title || logs.length === 0) {
             chainId = 0;
          }
        } catch (err) {
          console.error("兜底检查失败", err);
        }
      }

      if (chainId === undefined) {
        throw new Error("未在链上找到该项目，请确认项目是否已成功上链");
      }

      // 3. 读取资金状态
      const pData = await contracts.projectVaultManager.projects(chainId);

      // 4. 读取分配记录
      const allocFilter = contracts.projectVaultManager.filters.ProjectFundsAllocatedToBeneficiary(chainId);
      const allocLogs = await contracts.projectVaultManager.queryFilter(allocFilter);
      
      const allocations = allocLogs.map(log => ({
        beneficiary: log.args?.beneficiary,
        amount: ethers.utils.formatEther(log.args?.amount),
        timestamp: new Date(log.args?.timestamp.toNumber() * 1000).toLocaleString(),
        txHash: log.transactionHash
      })).reverse();

      setChainDetails({
        id: chainId,
        donatedAmount: ethers.utils.formatEther(pData.donatedAmount),
        remainingFunds: ethers.utils.formatEther(pData.remainingFunds),
        budget: ethers.utils.formatEther(pData.budget),
        allocations: allocations
      });

    } catch (error: any) {
      console.error("Fetch chain details error:", error);
      toast({ 
        title: "无法获取链上详情", 
        description: "请确保您的钱包已连接到 Sepolia 测试网，并且该项目已正确上链。",
        variant: "destructive" 
      });
      setChainDetails(null);
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

      toast({ title: "注册成功", description: "已提交审核" });
      setNgoStatus("pending");
    } catch (error: any) {
      toast({ title: "注册失败", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!organizerId) return;
    if (!contracts.projectVaultManager || !contracts.mockToken || !account) {
      toast({ title: "合约未连接", variant: "destructive" });
      return;
    }

    const budget = parseFloat(newProject.target_amount);
    if (!newProject.title || isNaN(budget) || budget <= 0) {
      toast({ title: "请输入有效信息", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const budgetWei = ethers.utils.parseEther(budget.toString());
      const requiredDepositWei = budgetWei.mul(120).div(100);

      // 1. 授权
      toast({ title: "步骤 1/3", description: "正在授权押金..." });
      const approveTx = await contracts.mockToken.approve(contracts.projectVaultManager.address, requiredDepositWei);
      await approveTx.wait();

      // 2. 链上创建
      toast({ title: "步骤 2/3", description: "正在链上创建..." });
      const createTx = await contracts.projectVaultManager.createProject(
        budgetWei,
        newProject.title,
        newProject.description,
        newProject.category,
        requiredDepositWei
      );
      await createTx.wait();

      // 3. 数据库同步
      toast({ title: "步骤 3/3", description: "保存数据..." });
      await supabase.from("projects").insert({
        organizer_id: organizerId,
        title: newProject.title,
        description: newProject.description,
        category: newProject.category,
        target_amount: budget,
        beneficiary_count: parseInt(newProject.beneficiary_count) || 0, // 防止 NaN
        image_url: newProject.image_url || null,
        status: "active",
      });

      toast({ title: "项目创建成功！" });
      setNewProject({ title: "", description: "", category: "", target_amount: "", beneficiary_count: "", image_url: "" });
      fetchData();
    } catch (error: any) {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveApplication = async (id: string) => { 
    await supabase.from("applications").update({status: "approved"}).eq("id", id);
    setApplications(prev => prev.map(a => a.id === id ? {...a, status: "approved"} : a));
    toast({title: "已批准"});
  };
  const handleRejectApplication = async (id: string) => { 
    await supabase.from("applications").update({status: "rejected"}).eq("id", id);
    setApplications(prev => prev.map(a => a.id === id ? {...a, status: "rejected"} : a));
    toast({title: "已拒绝"});
  };

  // --- 视图渲染 ---

  const renderRegisterView = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> 注册 NGO</CardTitle>
          <CardDescription>发起项目需先验证资质并缴纳押金。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!account ? (
            <Button onClick={connectWallet} className="w-full h-12">
              <Wallet className="w-4 h-4 mr-2" /> 连接钱包以注册
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>机构名称 *</Label>
                  <Input 
                    placeholder="输入机构全称" 
                    value={regForm.name} 
                    onChange={e => setRegForm({...regForm, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>机构类型</Label>
                  <Select onValueChange={v => setRegForm({...regForm, type: v})}>
                    <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Education">教育基金会</SelectItem>
                      <SelectItem value="Medical">医疗援助组织</SelectItem>
                      <SelectItem value="Environmental">环保组织</SelectItem>
                      <SelectItem value="Community">社区服务</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>执照/注册编号 (License ID) *</Label>
                <Input 
                  placeholder="输入政府颁发的注册编号" 
                  value={regForm.licenseId}
                  onChange={e => setRegForm({...regForm, licenseId: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>联系邮箱</Label>
                  <Input type="email" placeholder="contact@ngo.org" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>联系电话</Label>
                  <Input placeholder="+86 ..." value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>机构简介</Label>
                <Textarea 
                  placeholder="请简要描述机构的宗旨和过往项目..." 
                  value={regForm.description}
                  onChange={e => setRegForm({...regForm, description: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>质押押金 (MockToken) *</Label>
                <Input 
                  type="number" 
                  value={regForm.stakeAmount}
                  onChange={e => setRegForm({...regForm, stakeAmount: e.target.value})}
                />
                <p className="text-xs text-muted-foreground">押金将在您退出平台时退还，用于保障行为规范。</p>
              </div>

              <Button 
                className="w-full bg-gradient-primary mt-4 h-12 text-lg" 
                onClick={handleRegisterNGO} 
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                {loading ? "处理中..." : "提交注册申请"}
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
         <div className="max-w-5xl mx-auto space-y-6">
           {/* 创建表单 */}
           <Card className="border-primary/20 shadow-lg">
             <CardHeader className="bg-primary/5"><CardTitle>发起新项目</CardTitle></CardHeader>
             <CardContent className="space-y-4 pt-6">
               <div className="grid grid-cols-2 gap-4">
                 <Input value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} placeholder="项目标题" />
                 <Input type="number" value={newProject.target_amount} onChange={e => setNewProject({...newProject, target_amount: e.target.value})} placeholder="目标金额 (ETH)" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <Select onValueChange={v => setNewProject({...newProject, category: v})}><SelectTrigger><SelectValue placeholder="类别"/></SelectTrigger><SelectContent><SelectItem value="education">教育</SelectItem><SelectItem value="medical">医疗</SelectItem></SelectContent></Select>
                  <Input type="number" value={newProject.beneficiary_count} onChange={e => setNewProject({...newProject, beneficiary_count: e.target.value})} placeholder="预计受助人数" />
               </div>
               <Textarea value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} placeholder="描述..." />
               <Button onClick={handleCreateProject} disabled={loading} className="w-full">{loading ? <Loader2 className="animate-spin"/> : <Plus className="mr-2 w-4 h-4"/>} 创建项目 (需押金)</Button>
             </CardContent>
           </Card>

           {/* 项目列表 (Supabase源) + 详情按钮 */}
           <div className="space-y-4">
             <h3 className="text-xl font-bold flex items-center gap-2"><RefreshCw className="w-5 h-5"/> 已发布项目</h3>
             {myProjects.length === 0 ? (
               <div className="text-center py-10 text-muted-foreground border rounded-lg">暂无发布记录</div>
             ) : (
               myProjects.map(p => (
                 <Card key={p.id} className="hover:shadow-md transition-shadow">
                   <CardHeader className="pb-2">
                     <div className="flex justify-between items-center">
                       <div>
                         <CardTitle className="text-lg">{p.title}</CardTitle>
                         <Badge variant="outline">{p.category}</Badge>
                       </div>
                       <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(p)}>
                         <Eye className="w-4 h-4 mr-2"/> 实时详情 & 资金流向
                       </Button>
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
        <div className="grid md:grid-cols-2 gap-6">
          {applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex justify-between">
                    <CardTitle>{app.applicant_name}</CardTitle>
                    <Badge variant={app.status === "approved" ? "default" : "secondary"}>{app.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">{app.situation}</p>
                  {app.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => handleApproveApplication(app.id)}>批准</Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleRejectApplication(app.id)}>拒绝</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          {ngoStatus !== "approved" && (
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-6 hover:bg-accent">
              <ArrowLeft className="w-4 h-4 mr-2" /> 返回主页
            </Button>
          )}

          {ngoStatus === "register" && renderRegisterView()}
          
          {ngoStatus === "pending" && (
            <Card className="max-w-lg mx-auto text-center py-12 mt-8">
              <CardContent>
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-yellow-100 rounded-full">
                    <Loader2 className="w-12 h-12 text-yellow-600 animate-spin-slow" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">审核中</h2>
                <p className="text-muted-foreground">您的 NGO 注册申请已提交，正在等待平台管理员审核。</p>
              </CardContent>
            </Card>
          )}

          {ngoStatus === "rejected" && (
            <Card className="max-w-lg mx-auto text-center py-12 mt-8">
               <CardContent>
                <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">申请被拒绝</h2>
                <p className="text-muted-foreground mb-6">很抱歉，您的 NGO 认证申请未通过审核。</p>
                <Button onClick={() => setNgoStatus("register")}>重新提交申请</Button>
              </CardContent>
            </Card>
          )}

          {ngoStatus === "approved" && renderDashboard()}
        </div>
      </main>

      {/* 详情弹窗 */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>项目实时详情</DialogTitle>
            <DialogDescription>
              项目标题: <span className="font-bold text-primary">{selectedProject?.title}</span>
            </DialogDescription>
          </DialogHeader>
          
          {loadingDetails ? (
            <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary"/></div>
          ) : chainDetails ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 border border-green-100 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">已募集资金</div>
                  <div className="text-2xl font-bold text-green-700">{chainDetails.donatedAmount} ETH</div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">剩余可用资金</div>
                  <div className="text-2xl font-bold text-blue-700">{chainDetails.remainingFunds} ETH</div>
                </div>
              </div>

              <div className="space-y-2">
                 <div className="flex justify-between text-sm">
                   <span>募集进度</span>
                   <span className="font-mono">
                     {((parseFloat(chainDetails.donatedAmount) / (parseFloat(chainDetails.budget) || 1)) * 100).toFixed(1)}%
                   </span>
                 </div>
                 <Progress value={(parseFloat(chainDetails.donatedAmount) / (parseFloat(chainDetails.budget) || 1)) * 100} className="h-3" />
              </div>

              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-3 border-b pb-2">
                  <TrendingUp className="w-5 h-5 text-primary"/> 资金流向 (分配给受助者)
                </h3>
                {chainDetails.allocations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground bg-accent/10 rounded-lg">
                    暂无资金分配记录
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>受助人地址</TableHead>
                          <TableHead>金额</TableHead>
                          <TableHead>时间</TableHead>
                          <TableHead className="text-right">链上凭证</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chainDetails.allocations.map((record, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{record.beneficiary}</TableCell>
                            <TableCell className="font-bold text-green-600">+{record.amount}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{record.timestamp}</TableCell>
                            <TableCell className="text-right">
                              <a href={`https://sepolia.etherscan.io/tx/${record.txHash}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">
                                查看 Tx
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-red-500">
              未找到对应的链上合约数据，请确认该项目是否已成功上链。
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default NGO;
