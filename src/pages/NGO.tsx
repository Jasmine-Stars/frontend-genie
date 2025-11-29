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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
// ✅ 修复：在 import 中添加了 Users
import { Shield, CheckCircle, XCircle, Plus, ArrowLeft, Loader2, FileText, Building2, Wallet, RefreshCw, Eye, TrendingUp, Coins, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";
import { useContracts } from "@/hooks/useContracts";
import { useContractEvents } from "@/hooks/useContractEvents";
import { ethers } from "ethers";

interface Application {
  id: string;
  applicant_name: string;
  situation: string;
  requested_amount: number;
  status: string;
  created_at: string;
  project_id: string | null;
  address: string; // 受助人钱包地址
}

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

  // 资金分配弹窗状态
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [targetBeneficiary, setTargetBeneficiary] = useState<Application | null>(null);
  const [allocProjectId, setAllocProjectId] = useState<string>("");
  const [allocAmount, setAllocAmount] = useState<string>("");
  const [isAllocating, setIsAllocating] = useState(false);

  // 注册表单
  const [regForm, setRegForm] = useState({
    name: "", type: "", licenseId: "", email: "", phone: "", description: "", stakeAmount: "100", 
  });

  // 项目创建表单
  const [newProject, setNewProject] = useState({
    title: "", description: "", category: "", target_amount: "", beneficiary_count: "", image_url: "",
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const { account, connectWallet } = useWeb3();
  const contracts = useContracts();
  const { events } = useContractEvents();

  useEffect(() => { checkNGOStatus(); }, [account]);

  useEffect(() => {
    if (ngoStatus === "approved" && organizerId) {
      fetchDashboardData();
    }
  }, [selectedTab, ngoStatus, organizerId]);

  useEffect(() => {
    const relevantEvents = ["ProjectDonationReceived", "ProjectFundsAllocatedToBeneficiary", "ProjectCreated"];
    const hasUpdate = events.some(e => relevantEvents.includes(e.type));
    if (hasUpdate && ngoStatus === "approved") {
      if (detailsOpen && selectedProject) fetchChainDetails(selectedProject);
      if (selectedTab === "projects") fetchDashboardData();
    }
  }, [events]);

  const checkNGOStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setNgoStatus("register"); return; }
      const { data: organizer } = await supabase.from("organizers").select("id, status").eq("user_id", session.user.id).maybeSingle();
      if (!organizer) { setNgoStatus("register"); } else { setNgoStatus(organizer.status as any); setOrganizerId(organizer.id); }
    } catch (error) { console.error(error); setNgoStatus("register"); }
  };

  const fetchDashboardData = async () => {
    if (!organizerId) return;
    setLoading(true);
    try {
      if (selectedTab === "applications") {
        const { data: apps } = await supabase
          .from("applications")
          .select("*")
          .eq("status", "approved")
          .order("created_at", { ascending: false });
        setApplications(apps || []);
        
        const { data: projects } = await supabase
          .from("projects")
          .select("*")
          .eq("organizer_id", organizerId)
          .order("created_at", { ascending: false });
        setMyProjects(projects || []);

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

  const handleOpenDetails = (project: Project) => { setSelectedProject(project); setDetailsOpen(true); fetchChainDetails(project); };

  const fetchChainDetails = async (project: Project) => {
    if (!contracts.projectVaultManager) return;
    setLoadingDetails(true);
    try {
      let chainId: number | undefined;
      const filter = contracts.projectVaultManager.filters.ProjectCreated(); 
      const logs = await contracts.projectVaultManager.queryFilter(filter);
      const targetLog = logs.find(log => log.args?.title === project.title);
      if (targetLog) chainId = targetLog.args?.projectId.toNumber();
      else {
         try { const p0 = await contracts.projectVaultManager.projects(0); if (p0.title === project.title || logs.length === 0) chainId = 0; } catch (err) {}
      }
      if (chainId === undefined) throw new Error("未在链上找到该项目");

      const pData = await contracts.projectVaultManager.projects(chainId);
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
      toast({ title: "数据同步中", description: "暂未获取到链上数据", variant: "default" });
      setChainDetails(null);
    } finally { setLoadingDetails(false); }
  };

  const handleRegisterNGO = async () => {
    if (!account || !contracts.ngoRegistry || !contracts.mockToken) return;
    if (!regForm.name || !regForm.licenseId || !regForm.stakeAmount) {
      toast({ title: "信息不完整", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const stakeWei = ethers.utils.parseEther(regForm.stakeAmount);
      const approveTx = await contracts.mockToken.approve(contracts.ngoRegistry.address, stakeWei);
      await approveTx.wait();
      const registerTx = await contracts.ngoRegistry.registerNGO(regForm.name, regForm.licenseId, stakeWei);
      await registerTx.wait();
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
      if (!organizerId || !contracts.projectVaultManager || !contracts.mockToken || !account) return;
      const budget = parseFloat(newProject.target_amount);
      if (!newProject.title || isNaN(budget)) return;
      setLoading(true);
      try {
          const budgetWei = ethers.utils.parseEther(budget.toString());
          const requiredDepositWei = budgetWei.mul(120).div(100);
          const approveTx = await contracts.mockToken.approve(contracts.projectVaultManager.address, requiredDepositWei);
          await approveTx.wait();
          const createTx = await contracts.projectVaultManager.createProject(budgetWei, newProject.title, newProject.description, newProject.category, requiredDepositWei);
          await createTx.wait();
          await supabase.from("projects").insert({ organizer_id: organizerId, title: newProject.title, description: newProject.description, category: newProject.category, target_amount: budget, beneficiary_count: parseInt(newProject.beneficiary_count) || 0, status: "active" });
          toast({ title: "项目创建成功！" });
          fetchDashboardData();
      } catch (error: any) { toast({ title: "创建失败", description: error.message, variant: "destructive" }); } finally { setLoading(false); }
  };

  const openAllocateDialog = (app: Application) => {
    setTargetBeneficiary(app);
    setAllocationOpen(true);
  };

  const handleConfirmAllocation = async () => {
    if (!targetBeneficiary || !allocProjectId || !allocAmount) {
      toast({ title: "请填写完整", description: "请选择项目并输入金额", variant: "destructive" });
      return;
    }
    if (!contracts.projectVaultManager || !account) {
      toast({ title: "合约未连接", variant: "destructive" });
      return;
    }

    setIsAllocating(true);
    try {
      const selectedProjectData = myProjects.find(p => p.id === allocProjectId);
      if (!selectedProjectData) throw new Error("项目数据错误");

      const filter = contracts.projectVaultManager.filters.ProjectCreated(); 
      const logs = await contracts.projectVaultManager.queryFilter(filter);
      const targetLog = logs.find(log => log.args?.title === selectedProjectData.title);
      
      let chainId = targetLog ? targetLog.args?.projectId.toNumber() : 0; 

      toast({ title: "步骤 1/2", description: `正在从项目 #${chainId} 分配资金...` });

      const amountWei = ethers.utils.parseEther(allocAmount);
      
      const tx = await contracts.projectVaultManager.allocateToBeneficiary(
        chainId,
        targetBeneficiary.address, 
        amountWei
      );
      
      await tx.wait();

      toast({ 
        title: "分配成功！", 
        description: `已成功向 ${targetBeneficiary.applicant_name} 发放 ${allocAmount} ETH` 
      });
      
      setAllocationOpen(false);
      setAllocAmount("");
      setAllocProjectId("");

    } catch (error: any) {
      console.error("Allocation error:", error);
      toast({ 
        title: "分配失败", 
        description: error.reason || error.message || "可能余额不足或非管理员", 
        variant: "destructive" 
      });
    } finally {
      setIsAllocating(false);
    }
  };

  // --- 渲染视图 ---
  
  const renderRegisterView = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            注册成为 NGO 机构
          </CardTitle>
          <CardDescription>
            在 SheAid 平台上发起慈善项目，需要先验证机构资质并缴纳押金。
          </CardDescription>
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
        <Button variant={selectedTab === "applications" ? "default" : "outline"} onClick={() => setSelectedTab("applications")}>
          受助人/资金分配
        </Button>
        <Button variant={selectedTab === "projects" ? "default" : "outline"} onClick={() => setSelectedTab("projects")}>
          项目管理
        </Button>
      </div>

      {!loading && selectedTab === "applications" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
             <Users className="w-6 h-6 text-primary" /> 可分配资金的受助人
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {applications.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-muted-foreground bg-accent/10 rounded-lg">
                暂无已通过审核的受助人
              </div>
            ) : (
              applications.map((app) => (
                <Card key={app.id} className="hover:shadow-md transition-shadow border-l-4 border-l-green-500">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {app.applicant_name}
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-200">已认证</Badge>
                        </CardTitle>
                        <CardDescription className="font-mono text-xs mt-1">
                          {app.address}
                        </CardDescription>
                      </div>
                      <Button onClick={() => openAllocateDialog(app)} size="sm" className="bg-green-600 hover:bg-green-700">
                        <Coins className="w-4 h-4 mr-2" /> 分配资金
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">困境描述:</span> {app.situation}</p>
                      <p><span className="text-muted-foreground">申请金额:</span> ¥{app.requested_amount}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {!loading && selectedTab === "projects" && (
         <div className="max-w-5xl mx-auto space-y-6">
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

           <div className="space-y-4">
             <h3 className="text-xl font-bold flex items-center gap-2"><RefreshCw className="w-5 h-5"/> 已发布项目</h3>
             {myProjects.map(p => (
                 <Card key={p.id} className="hover:shadow-md transition-shadow">
                   <CardHeader className="pb-2">
                     <div className="flex justify-between items-center">
                       <div><CardTitle className="text-lg">{p.title}</CardTitle><Badge variant="outline">{p.category}</Badge></div>
                       <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(p)}><Eye className="w-4 h-4 mr-2"/> 实时详情</Button>
                     </div>
                     <CardDescription>目标: {p.target_amount} ETH</CardDescription>
                   </CardHeader>
                   <CardContent><p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p></CardContent>
                 </Card>
             ))}
           </div>
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

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>项目详情</DialogTitle><DialogDescription>链上 ID: {chainDetails?.id}</DialogDescription></DialogHeader>
          {loadingDetails ? <Loader2 className="animate-spin mx-auto"/> : chainDetails && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded text-center"><div>已募集</div><div className="text-xl font-bold text-green-600">{chainDetails.donatedAmount} ETH</div></div>
                <div className="p-4 border rounded text-center"><div>剩余可用</div><div className="text-xl font-bold text-blue-600">{chainDetails.remainingFunds} ETH</div></div>
              </div>
              <Progress value={(parseFloat(chainDetails.donatedAmount)/parseFloat(chainDetails.budget))*100} />
              <Table>
                <TableHeader><TableRow><TableHead>受助人</TableHead><TableHead>金额</TableHead><TableHead>TX</TableHead></TableRow></TableHeader>
                <TableBody>{chainDetails.allocations.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.beneficiary.slice(0,6)}...</TableCell>
                    <TableCell>{r.amount}</TableCell>
                    <TableCell><a href={`https://sepolia.etherscan.io/tx/${r.txHash}`} target="_blank" className="text-blue-500 underline text-xs">查看</a></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>资金分配</DialogTitle>
            <DialogDescription>将善款分配给受助人: {targetBeneficiary?.applicant_name}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择资金来源项目</Label>
              <Select onValueChange={setAllocProjectId} value={allocProjectId}>
                <SelectTrigger><SelectValue placeholder="请选择一个有余额的项目" /></SelectTrigger>
                <SelectContent>
                  {myProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.title} (目标: {p.target_amount} ETH)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>分配金额 (ETH)</Label>
              <Input 
                type="number" 
                placeholder="0.1" 
                value={allocAmount}
                onChange={e => setAllocAmount(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocationOpen(false)} disabled={isAllocating}>取消</Button>
            <Button onClick={handleConfirmAllocation} disabled={isAllocating}>
              {isAllocating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
              确认分配
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default NGO;
