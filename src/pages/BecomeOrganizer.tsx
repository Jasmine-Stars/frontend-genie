import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  Building2, 
  FileText, 
  CheckCircle2, 
  Clock, 
  XCircle,
  AlertCircle,
  Upload
} from "lucide-react";

const organizerSchema = z.object({
  organizationName: z.string()
    .trim()
    .min(2, { message: "机构名称至少需要2个字符" })
    .max(100, { message: "机构名称不能超过100个字符" }),
  organizationType: z.string()
    .min(1, { message: "请选择机构类型" }),
  registrationNumber: z.string()
    .trim()
    .max(50, { message: "注册号不能超过50个字符" })
    .optional(),
  websiteUrl: z.string()
    .trim()
    .url({ message: "请输入有效的网址" })
    .max(255)
    .optional()
    .or(z.literal("")),
  description: z.string()
    .trim()
    .min(50, { message: "机构描述至少需要50个字符" })
    .max(1000, { message: "机构描述不能超过1000个字符" }),
  contactEmail: z.string()
    .trim()
    .email({ message: "请输入有效的邮箱地址" })
    .max(255),
  contactPhone: z.string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, { message: "请输入有效的手机号码" }),
});

type OrganizerFormValues = z.infer<typeof organizerSchema>;

const BecomeOrganizer = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [existingApplication, setExistingApplication] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const form = useForm<OrganizerFormValues>({
    resolver: zodResolver(organizerSchema),
    defaultValues: {
      organizationName: "",
      organizationType: "",
      registrationNumber: "",
      websiteUrl: "",
      description: "",
      contactEmail: "",
      contactPhone: "",
    },
  });

  useEffect(() => {
    const checkAuthAndApplication = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          toast({
            title: "请先登录",
            description: "您需要登录后才能申请成为项目发起人",
            variant: "destructive",
          });
          navigate("/auth");
          return;
        }

        setUser(session.user);

        // Check if user already has an application
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          const { data: organizer } = await supabase
            .from("organizers")
            .select("*")
            .eq("user_id", profile.id)
            .maybeSingle();

          if (organizer) {
            setExistingApplication(organizer);
          }
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuthAndApplication();
  }, [navigate, toast]);

  const onSubmit = async (data: OrganizerFormValues) => {
    if (!user) {
      toast({
        title: "请先登录",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("organizers")
        .insert({
          user_id: user.id,
          organization_name: data.organizationName,
          organization_type: data.organizationType,
          registration_number: data.registrationNumber || null,
          website_url: data.websiteUrl || null,
          description: data.description,
          contact_email: data.contactEmail,
          contact_phone: data.contactPhone,
          status: "pending",
        });

      if (error) {
        console.error("Error submitting application:", error);
        toast({
          title: "提交失败",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "申请已提交",
          description: "我们将在3-5个工作日内审核您的申请",
        });
        
        // Refresh to show the application status
        window.location.reload();
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "发生错误",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (existingApplication) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-6 max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-primary" />
                  申请状态
                </CardTitle>
                <CardDescription>您的项目发起人申请信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold mb-1">申请状态</div>
                    <div className="text-sm text-muted-foreground">
                      提交时间：{new Date(existingApplication.created_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {existingApplication.status === "pending" && (
                    <Badge variant="outline" className="gap-2">
                      <Clock className="w-4 h-4" />
                      审核中
                    </Badge>
                  )}
                  {existingApplication.status === "approved" && (
                    <Badge className="gap-2 bg-green-500">
                      <CheckCircle2 className="w-4 h-4" />
                      已通过
                    </Badge>
                  )}
                  {existingApplication.status === "rejected" && (
                    <Badge variant="destructive" className="gap-2">
                      <XCircle className="w-4 h-4" />
                      未通过
                    </Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-3 bg-accent/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">机构名称</div>
                      <div className="font-medium">{existingApplication.organization_name}</div>
                    </div>
                    <div className="p-3 bg-accent/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">机构类型</div>
                      <div className="font-medium">{existingApplication.organization_type}</div>
                    </div>
                  </div>

                  {existingApplication.registration_number && (
                    <div className="p-3 bg-accent/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">注册号</div>
                      <div className="font-medium">{existingApplication.registration_number}</div>
                    </div>
                  )}

                  <div className="p-3 bg-accent/50 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">机构描述</div>
                    <div className="text-sm">{existingApplication.description}</div>
                  </div>

                  {existingApplication.status === "rejected" && existingApplication.rejection_reason && (
                    <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                        <div>
                          <div className="font-semibold text-destructive mb-1">拒绝原因</div>
                          <div className="text-sm">{existingApplication.rejection_reason}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {existingApplication.status === "approved" && (
                    <div className="p-4 border border-green-500/50 bg-green-500/10 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-semibold text-green-700 dark:text-green-400 mb-1">
                            恭喜！您已成为认证发起人
                          </div>
                          <div className="text-sm text-muted-foreground">
                            您现在可以创建和管理项目了
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {existingApplication.status === "rejected" && (
                  <Button 
                    onClick={() => navigate("/become-organizer-reapply")}
                    className="w-full"
                  >
                    重新申请
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
              成为项目发起人
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              加入我们，为需要帮助的女性创建救助项目
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  申请信息
                </CardTitle>
                <CardDescription>
                  请如实填写您的机构信息，我们将在3-5个工作日内完成审核
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="organizationName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            机构名称 *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="请输入机构全称" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organizationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>机构类型 *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="请选择机构类型" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ngo">非政府组织 (NGO)</SelectItem>
                              <SelectItem value="nonprofit">非营利组织</SelectItem>
                              <SelectItem value="charity">慈善机构</SelectItem>
                              <SelectItem value="foundation">基金会</SelectItem>
                              <SelectItem value="social_enterprise">社会企业</SelectItem>
                              <SelectItem value="community">社区组织</SelectItem>
                              <SelectItem value="other">其他</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="registrationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>注册号/统一社会信用代码</FormLabel>
                          <FormControl>
                            <Input placeholder="如有请填写" {...field} />
                          </FormControl>
                          <FormDescription>
                            提供注册号将有助于加快审核
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="websiteUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>机构网站</FormLabel>
                          <FormControl>
                            <Input 
                              type="url" 
                              placeholder="https://example.org" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            如有官方网站请填写完整URL
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>机构描述 *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="请详细描述您的机构使命、主要工作内容、过往成就等..."
                              className="min-h-[150px]"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            至少50个字符，最多1000个字符
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="contactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>联系邮箱 *</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                placeholder="contact@example.org" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="contactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>联系电话 *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="请输入手机号码" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="p-4 bg-accent/50 rounded-lg border border-border">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="text-sm space-y-2">
                          <div className="font-semibold">申请须知</div>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>我们将对提交的信息进行严格审核</li>
                            <li>审核周期为3-5个工作日</li>
                            <li>审核通过后，您将获得创建项目的权限</li>
                            <li>请确保提供的信息真实有效</li>
                            <li>虚假信息将导致申请被永久拒绝</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit"
                      className="w-full bg-gradient-primary hover:opacity-90 transition-opacity"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? "提交中..." : "提交申请"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BecomeOrganizer;
