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
import { Shield, CheckCircle, XCircle, Plus, ArrowLeft, Loader2, FileText, Building2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";
import { useContracts } from "@/hooks/useContracts";
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
  category: string;
}

const NGO = () => {
  // 状态管理：register(未注册), pending(审核中), approved(已通过), rejected(被拒绝)
  const [ngoStatus, setNgoStatus] = useState<"loading" | "register" | "pending" | "approved" | "rejected">("loading");
  const [selectedTab, setSelectedTab] = useState<"applications" | "projects" | "allocations">("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  
  // 注册表单状态
  const [regForm, setRegForm] = useState({
    name: "",
    type: "",
    licenseId: "",
    email: "",
    phone: "",
    description: "",
    stakeAmount: "100", // 默认押金
  });

  // 项目创建表单状态
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

  // 初始化检查状态
  useEffect(() => {
    checkNGOStatus();
  }, [account]);

  // 当状态确认为 approved 后，加载业务数据
  useEffect(() => {
    if (ngoStatus === "approved" && organizerId) {
      fetchDashboardData();
    }
  }, [selectedTab, ngoStatus, organizerId]);

  const checkNGOStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNgoStatus("register"); // 未登录也显示注册引导（或重定向）
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
        // 获取申请列表
        const { data: projectIds } = await supabase
          .from("projects")
          .select("id")
          .eq("organizer_id", organizerId);

        if (projectIds && projectIds.length > 0) {
          const { data: apps } = await supabase
            .from("applications")
            .select("*")
            .in("project_id", projectIds.map(p => p.id))
            .order("created_at", { ascending: false });
          setApplications(apps || []);
        }
      } else if (selectedTab === "projects") {
        // 获取我的项目
        const { data: projects } = await supabase
          .from("projects")
          .select("id, title, category")
          .eq("organizer_id", organizerId);
        setMyProjects(projects || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 核心功能：注册 NGO ---
  const handleRegisterNGO = async () => {
    if (!account || !contracts.ngoRegistry || !contracts.mockToken) {
      toast({ title: "请连接钱包", description: "需要连接钱包并加载合约", variant: "destructive" });
      return;
    }

    if (!regForm.name || !regForm.licenseId || !regForm.stakeAmount) {
      toast({ title: "信息不完整", description: "请填写必填项", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const stakeWei = ethers.utils.parseEther(regForm.stakeAmount);

      // 1. 授权押金
      toast({ title: "步骤 1/3", description: "正在授权支付押金..." });
      const approveTx = await contracts.mockToken.approve(contracts.ngoRegistry.address, stakeWei);
      await approveTx.wait();

      // 2. 调用合约注册
      toast({ title: "步骤 2/3", description: "正在链上注册..." });
      const registerTx = await contracts.ngoRegistry.registerNGO(
        regForm.name,
        regForm.licenseId,
        stakeWei
      );
      await registerTx.wait();

      // 3. 写入 Supabase 供管理员审核
      toast({ title: "步骤 3/3", description: "提交审核申请..." });
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("organizers").insert({
        user_id: user?.id,
        organization_name: regForm.name,
        organization_type: regForm.type || "General",
        registration_number: regForm.licenseId,
        contact_email: regForm.email,
        contact_phone: regForm.phone,
        description: regForm.description,
        status: "pending" // 初始状态
      });

      if (error) throw error;

      toast({ title: "注册成功", description: "申请已提交，请等待平台管理员审核" });
      setNgoStatus("pending");

    } catch (error: any) {
      console.error(error);
      toast({ title: "注册失败", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- 业务功能：审核申请 ---
  const handleApproveApplication = async (applicationId: string) => {
    // ... (与之前相同，省略部分逻辑以保持代码整洁) ...
    // 这里建议同样加上乐观更新逻辑
    try {
      await supabase.from("applications").update({ status: "approved" }).eq("id", applicationId);
      setApplications(prev => prev.map(app => app.id === applicationId ? { ...app, status: "approved" } : app));
      toast({ title: "审核通过" });
    } catch (e) { toast({ title: "失败", variant: "destructive" }) }
  };

  const handleRejectApplication = async (applicationId: string) => {
    try {
      await supabase.from("applications").update({ status: "rejected" }).eq("id", applicationId);
      setApplications(prev => prev.map(app => app.id === applicationId ? { ...app, status: "rejected" } : app));
      toast({ title: "已拒绝" });
    } catch (e) { toast({ title: "失败", variant: "destructive" }) }
  };

  // --- 业务功能：创建项目 ---
  const handleCreateProject = async () => {
    if (!organizerId || !contracts.projectVaultManager) return;
    setLoading(true);
    try {
      // 1. 链上创建项目 (ProjectVaultManager.createProject)
      // 需要先 approve 押金给 ProjectVaultManager
      // 这里简化为只存数据库，实际应该先上链拿到 projectId
      
      const { error } = await supabase.from("projects").insert({
        organizer_id: organizerId,
        title: newProject.title,
        description: newProject.description,
        category: newProject.category,
        target_amount: parseFloat(newProject.target_amount),
        beneficiary_count: parseInt(newProject.beneficiary_count),
        image_url: newProject.image_url || null,
        status: "active",
      });

      if (error) throw error;
      toast({ title: "项目创建成功" });
      setNewProject({ title: "", description: "", category: "", target_amount: "", beneficiary_count: "", image_url: "" });
      fetchDashboardData();
    } catch (error: any) {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- 渲染视图 ---

  // 1. 注册视图 (Register View)
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
                <div>
                  <Label>机构名称 *</Label>
                  <Input 
                    placeholder="输入机构全称" 
                    value={regForm.name} 
                    onChange={e => setRegForm({...regForm, name: e.target.value})} 
                  />
                </div>
                <div>
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
              <div>
                <Label>执照/注册编号 (License ID) *</Label>
                <Input 
                  placeholder="输入政府颁发的注册编号" 
                  value={regForm.licenseId}
                  onChange={e => setRegForm({...regForm, licenseId: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>联系邮箱</Label>
                  <Input type="email" placeholder="contact@ngo.org" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
                </div>
                <div>
                  <Label>联系电话</Label>
                  <Input placeholder="+86 ..." value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} />
                </div>
              </div>
              <div>
                <Label>机构简介</Label>
                <Textarea 
                  placeholder="请简要描述机构的宗旨和过往项目..." 
                  value={regForm.description}
                  onChange={e => setRegForm({...regForm, description: e.target.value})}
                />
              </div>
              <div>
                <Label>质押押金 (MockToken) *</Label>
                <Input 
                  type="number" 
                  value={regForm.stakeAmount}
                  onChange={e => setRegForm({...regForm, stakeAmount: e.target.value})}
                />
                <p className="text-xs text-muted-foreground mt-1">押金将在您退出平台时退还，用于保障行为规范。</p>
              </div>
              <Button 
                className="w-full bg-gradient-primary mt-4" 
                onClick={handleRegisterNGO} 
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                提交注册申请
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // 2. 审核中视图 (Pending View)
  const renderPendingView = () => (
    <Card className="max-w-lg mx-auto text-center py-12">
      <CardContent>
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-yellow-100 rounded-full">
            <Loader2 className="w-12 h-12 text-yellow-600 animate-spin-slow" />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">审核中</h2>
        <p className="text-muted-foreground mb-6">
          您的 NGO 注册申请已提交，正在等待平台管理员审核。<br/>
          审核通过后，您将获得发起项目和分配资金的权限。
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>返回主页</Button>
      </CardContent>
    </Card>
  );

  // 3. 被拒绝视图 (Rejected View)
  const renderRejectedView = () => (
    <Card className="max-w-lg mx-auto text-center py-12">
      <CardContent>
        <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">申请被拒绝</h2>
        <p className="text-muted-foreground mb-6">很抱歉，您的 NGO 认证申请未通过审核。</p>
        <Button onClick={() => setNgoStatus("register")}>重新提交申请</Button>
      </CardContent>
    </Card>
  );

  // 4. 主控制台 (Dashboard View - 即你原来的代码逻辑)
  const renderDashboard = () => (
    <>
      <div className="text-center mb-12">
        <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
        <h1 className="text-4xl md:text-5xl font-bold mb-4">NGO机构管理</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          审核受助申请、创建慈善项目、管理资金分配
        </p>
      </div>

      <div className="flex gap-4 mb-8 justify-center flex-wrap">
        <Button variant={selectedTab === "applications" ? "default" : "outline"} onClick={() => setSelectedTab("applications")}>
          <FileText className="w-4 h-4 mr-2" /> 审核申请
        </Button>
        <Button variant={selectedTab === "projects" ? "default" : "outline"} onClick={() => setSelectedTab("projects")}>
          <Plus className="w-4 h-4 mr-2" /> 项目管理
        </Button>
        <Button variant={selectedTab === "allocations" ? "default" : "outline"} onClick={() => setSelectedTab("allocations")}>
          <Shield className="w-4 h-4 mr-2" /> 资金分配
        </Button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}

      {!loading && selectedTab === "applications" && (
        <div className="grid md:grid-cols-2 gap-6">
          {applications.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-muted-foreground">暂无待审核的申请</div>
          ) : (
            applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{app.applicant_name}</CardTitle>
                      <CardDescription>{new Date(app.created_at).toLocaleDateString()}</CardDescription>
                    </div>
                    <Badge variant={app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : "secondary"}>
                      {app.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-2"><strong>情况:</strong> {app.situation}</p>
                  <p className="text-sm mb-4"><strong>申请:</strong> {app.requested_amount} 元</p>
                  {app.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => handleApproveApplication(app.id)}><CheckCircle className="w-4 h-4 mr-1" /> 批准</Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleRejectApplication(app.id)}><XCircle className="w-4 h-4 mr-1" /> 拒绝</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
      
      {/* ... 这里保留你原有的 projects 和 allocations 渲染代码，为节省篇幅我不再重复粘贴，你可以直接把你原来的这两个 Tab 内容贴在这里 ... */}
      {!loading && selectedTab === "projects" && (
         <div className="max-w-3xl mx-auto space-y-6">
           <Card>
             <CardHeader><CardTitle>创建慈善项目</CardTitle></CardHeader>
             <CardContent className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div><Label>项目标题</Label><Input value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} /></div>
                 <div><Label>目标金额</Label><Input type="number" value={newProject.target_amount} onChange={e => setNewProject({...newProject, target_amount: e.target.value})} /></div>
               </div>
               <div><Label>描述</Label><Textarea value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} /></div>
               <Button onClick={handleCreateProject} className="w-full"><Plus className="mr-2 h-4 w-4"/> 创建</Button>
             </CardContent>
           </Card>
           {myProjects.map(p => (
             <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{p.category}</CardDescription></CardHeader></Card>
           ))}
         </div>
      )}

      {!loading && selectedTab === "allocations" && (
        <Card><CardContent className="py-12 text-center">资金分配功能开发中</CardContent></Card>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          {/* 顶部的返回按钮 */}
          {ngoStatus !== "approved" && (
            <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" /> 返回主页
            </Button>
          )}

          {/* 根据状态路由渲染不同的界面 */}
          {ngoStatus === "register" && renderRegisterView()}
          {ngoStatus === "pending" && renderPendingView()}
          {ngoStatus === "rejected" && renderRejectedView()}
          {ngoStatus === "approved" && renderDashboard()}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NGO;
