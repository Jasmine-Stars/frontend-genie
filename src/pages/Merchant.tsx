import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Package, Upload, CheckCircle, ArrowLeft, Plus, Trash2, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";
import { useContracts } from "@/hooks/useContracts";
import { ethers } from "ethers";
import { supabase } from "@/integrations/supabase/client";

interface Product {
  id: string;
  categoryId: string;
  merchant: string;
  price: string;
  stock: number;
  isActive: boolean;
  metadata: string;
}

const Merchant = () => {
  const [selectedTab, setSelectedTab] = useState<"supplies" | "manage" | "redeem">("supplies");
  const [products, setProducts] = useState<Product[]>([]);
  const [isMerchant, setIsMerchant] = useState(false);
  const [isBeneficiary, setIsBeneficiary] = useState(false);
  const [beneficiaryBalance, setBeneficiaryBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  
  // 商户注册表单
  const [merchantName, setMerchantName] = useState("");
  const [merchantMetadata, setMerchantMetadata] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  
  // 上架商品表单
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("");
  const [productCategory, setProductCategory] = useState("ESSENTIAL_SUPPLIES");
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { account, connectWallet } = useWeb3();
  const contracts = useContracts();

  useEffect(() => {
    if (account && contracts.marketplace && contracts.merchantRegistry && contracts.beneficiaryModule) {
      checkUserRoles();
      loadProducts();
    }
  }, [account, contracts]);

  const checkUserRoles = async () => {
    if (!account || !contracts.merchantRegistry || !contracts.beneficiaryModule) return;
    
    try {
      // 检查是否是商户
      const merchantInfo = await contracts.merchantRegistry.merchants(account);
      setIsMerchant(merchantInfo.status === 1); // 1 = Active
      
      // 检查是否是受助者并获取余额
      const beneficiaryInfo = await contracts.beneficiaryModule.beneficiaries(account);
      const isActiveBeneficiary = beneficiaryInfo.isActive;
      setIsBeneficiary(isActiveBeneficiary);
      
      if (isActiveBeneficiary) {
        const balance = await contracts.beneficiaryModule.getCharityPoints(account);
        setBeneficiaryBalance(ethers.utils.formatEther(balance));
      }
    } catch (error) {
      console.error("检查用户角色失败:", error);
    }
  };

  const loadProducts = async () => {
    if (!contracts.marketplace) return;
    
    try {
      setLoading(true);
      const productCount = await contracts.marketplace.nextProductId();
      const loadedProducts: Product[] = [];
      
      for (let i = 0; i < productCount.toNumber(); i++) {
        try {
          const product = await contracts.marketplace.products(i);
          if (product.merchant !== ethers.constants.AddressZero) {
            loadedProducts.push({
              id: i.toString(),
              categoryId: product.categoryId,
              merchant: product.merchant,
              price: ethers.utils.formatEther(product.price),
              stock: product.stock.toNumber(),
              isActive: product.isActive,
              metadata: product.metadata
            });
          }
        } catch (err) {
          console.error(`加载商品 ${i} 失败:`, err);
        }
      }
      
      setProducts(loadedProducts);
    } catch (error) {
      console.error("加载商品列表失败:", error);
      toast({
        title: "加载失败",
        description: "无法加载商品列表",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMerchantRegister = async () => {
    if (!account) {
      toast({
        title: "请先连接钱包",
        description: "需要连接MetaMask钱包",
        variant: "destructive",
      });
      return;
    }

    if (!merchantName || !stakeAmount) {
      toast({
        title: "请填写完整信息",
        description: "商户名称和押金金额不能为空",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
      
      // 先授权代币
      const approveTx = await contracts.mockToken.approve(
        contracts.merchantRegistry.address,
        stakeAmountWei
      );
      await approveTx.wait();
      
      // 注册商户
      const registerTx = await contracts.merchantRegistry.registerMerchant(
        merchantName,
        merchantMetadata,
        stakeAmountWei
      );
      await registerTx.wait();
      
      toast({
        title: "注册成功",
        description: "商户注册已提交，等待平台管理员审核",
      });
      
      checkUserRoles();
    } catch (error: any) {
      console.error("商户注册失败:", error);
      toast({
        title: "注册失败",
        description: error.message || "商户注册失败",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleListProduct = async () => {
    if (!account || !isMerchant) {
      toast({
        title: "无权操作",
        description: "只有已注册的商户可以上架商品",
        variant: "destructive",
      });
      return;
    }

    if (!productName || !productPrice || !productStock) {
      toast({
        title: "请填写完整信息",
        description: "商品信息不能为空",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const categoryBytes = ethers.utils.formatBytes32String(productCategory);
      const priceWei = ethers.utils.parseEther(productPrice);
      const productMetadata = JSON.stringify({ name: productName });
      
      const tx = await contracts.marketplace.listProduct(
        categoryBytes,
        priceWei,
        parseInt(productStock),
        productMetadata
      );
      await tx.wait();
      
      toast({
        title: "上架成功",
        description: "商品已成功上架",
      });
      
      // 清空表单
      setProductName("");
      setProductPrice("");
      setProductStock("");
      
      loadProducts();
    } catch (error: any) {
      console.error("上架商品失败:", error);
      toast({
        title: "上架失败",
        description: error.message || "上架商品失败",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleProductStatus = async (productId: string, currentStatus: boolean) => {
    if (!account || !isMerchant) return;

    try {
      setLoading(true);
      const tx = await contracts.marketplace.setProductActive(parseInt(productId), !currentStatus);
      await tx.wait();
      
      toast({
        title: currentStatus ? "商品已下架" : "商品已上架",
        description: "商品状态已更新",
      });
      
      loadProducts();
    } catch (error: any) {
      console.error("修改商品状态失败:", error);
      toast({
        title: "操作失败",
        description: error.message || "修改商品状态失败",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemProduct = async (productId: string, price: string) => {
    if (!account || !isBeneficiary) {
      toast({
        title: "无权操作",
        description: "只有受助者可以核销商品",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // 调用BeneficiaryModule的核销功能
      const tx = await contracts.beneficiaryModule.redeemProduct(
        parseInt(productId),
        1 // 数量默认为1
      );
      await tx.wait();
      
      toast({
        title: "核销成功",
        description: "商品已成功核销，请等待商户发货",
      });
      
      checkUserRoles();
      loadProducts();
    } catch (error: any) {
      console.error("核销商品失败:", error);
      toast({
        title: "核销失败",
        description: error.message || "核销商品失败，可能余额不足",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const myProducts = products.filter(p => p.merchant.toLowerCase() === account?.toLowerCase());
  const activeProducts = products.filter(p => p.isActive);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-32 pb-20">
        <div className="container mx-auto px-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6 hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回主页
          </Button>

          <div className="text-center mb-12">
            <Package className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4">商户中心</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {!account && "请连接钱包以查看更多功能"}
              {account && !isMerchant && !isBeneficiary && "注册成为商户或受助者以使用完整功能"}
              {account && isMerchant && "管理您的商品和订单"}
              {account && isBeneficiary && `您的慈善余额: ${beneficiaryBalance} 代币`}
            </p>
          </div>

          {!account ? (
            <div className="text-center">
              <Button onClick={connectWallet} size="lg">
                连接 MetaMask 钱包
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-4 mb-8 justify-center flex-wrap">
                <Button
                  variant={selectedTab === "supplies" ? "default" : "outline"}
                  onClick={() => setSelectedTab("supplies")}
                >
                  商品列表
                </Button>
                {isMerchant && (
                  <Button
                    variant={selectedTab === "manage" ? "default" : "outline"}
                    onClick={() => setSelectedTab("manage")}
                  >
                    商户管理
                  </Button>
                )}
                {isBeneficiary && (
                  <Button
                    variant={selectedTab === "redeem" ? "default" : "outline"}
                    onClick={() => setSelectedTab("redeem")}
                  >
                    核销商品
                  </Button>
                )}
              </div>

              {selectedTab === "supplies" && (
                <div className="grid md:grid-cols-3 gap-6">
                  {loading ? (
                    <p className="col-span-3 text-center">加载中...</p>
                  ) : activeProducts.length === 0 ? (
                    <p className="col-span-3 text-center text-muted-foreground">暂无商品</p>
                  ) : (
                    activeProducts.map((product) => {
                      const metadata = JSON.parse(product.metadata || '{"name":"商品"}');
                      return (
                        <Card key={product.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg">{metadata.name}</CardTitle>
                              <Badge variant="default">上架中</Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-2xl font-bold mb-2">{product.price} 代币</p>
                            <p className="text-sm text-muted-foreground mb-3">库存: {product.stock} 份</p>
                            {isBeneficiary && (
                              <Button 
                                className="w-full" 
                                size="sm"
                                onClick={() => handleRedeemProduct(product.id, product.price)}
                                disabled={loading || parseFloat(beneficiaryBalance) < parseFloat(product.price)}
                              >
                                <ShoppingCart className="w-4 h-4 mr-2" />
                                核销领取
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              )}

              {selectedTab === "manage" && isMerchant && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>上架新商品</CardTitle>
                      <CardDescription>添加商品到商城供受助者核销</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">商品名称</label>
                        <Input 
                          placeholder="输入商品名称" 
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">商品类别</label>
                        <select 
                          className="w-full border rounded-md p-2"
                          value={productCategory}
                          onChange={(e) => setProductCategory(e.target.value)}
                        >
                          <option value="ESSENTIAL_SUPPLIES">生活必需品</option>
                          <option value="MEDICAL_SUPPLIES">医疗用品</option>
                          <option value="EDUCATION_SUPPLIES">教育用品</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">价格（代币）</label>
                        <Input 
                          type="number" 
                          placeholder="输入价格" 
                          value={productPrice}
                          onChange={(e) => setProductPrice(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">库存数量</label>
                        <Input 
                          type="number" 
                          placeholder="输入库存" 
                          value={productStock}
                          onChange={(e) => setProductStock(e.target.value)}
                        />
                      </div>
                      <Button 
                        className="w-full"
                        onClick={handleListProduct}
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        上架商品
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>我的商品</CardTitle>
                      <CardDescription>管理已上架的商品</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {myProducts.length === 0 ? (
                          <p className="text-center text-muted-foreground">暂无商品</p>
                        ) : (
                          myProducts.map((product) => {
                            const metadata = JSON.parse(product.metadata || '{"name":"商品"}');
                            return (
                              <div
                                key={product.id}
                                className="flex justify-between items-center p-4 bg-accent/20 rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">{metadata.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    价格: {product.price} 代币 | 库存: {product.stock}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={product.isActive ? "default" : "secondary"}>
                                    {product.isActive ? "上架中" : "已下架"}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant={product.isActive ? "destructive" : "default"}
                                    onClick={() => handleToggleProductStatus(product.id, product.isActive)}
                                    disabled={loading}
                                  >
                                    {product.isActive ? "下架" : "上架"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {selectedTab === "redeem" && isBeneficiary && (
                <div className="max-w-4xl mx-auto">
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>我的慈善余额</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-primary">{beneficiaryBalance} 代币</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        您可以使用余额在商品列表中核销商品
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>可核销商品</CardTitle>
                      <CardDescription>选择商品进行核销领取</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-4">
                        {activeProducts.map((product) => {
                          const metadata = JSON.parse(product.metadata || '{"name":"商品"}');
                          const canAfford = parseFloat(beneficiaryBalance) >= parseFloat(product.price);
                          return (
                            <div
                              key={product.id}
                              className="p-4 border rounded-lg space-y-3"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{metadata.name}</p>
                                  <p className="text-sm text-muted-foreground">库存: {product.stock}</p>
                                </div>
                                <Badge variant={canAfford ? "default" : "secondary"}>
                                  {product.price} 代币
                                </Badge>
                              </div>
                              <Button
                                className="w-full"
                                size="sm"
                                onClick={() => handleRedeemProduct(product.id, product.price)}
                                disabled={loading || !canAfford || product.stock === 0}
                              >
                                <ShoppingCart className="w-4 h-4 mr-2" />
                                {!canAfford ? "余额不足" : product.stock === 0 ? "缺货" : "核销领取"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!isMerchant && !isBeneficiary && (
                <div className="max-w-2xl mx-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>注册成为商户</CardTitle>
                      <CardDescription>缴纳押金后即可上架商品</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">商户名称</label>
                        <Input 
                          placeholder="输入商户名称"
                          value={merchantName}
                          onChange={(e) => setMerchantName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">商户简介（可选）</label>
                        <Textarea 
                          placeholder="介绍您的商户信息"
                          value={merchantMetadata}
                          onChange={(e) => setMerchantMetadata(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">押金金额（代币）</label>
                        <Input 
                          type="number"
                          placeholder="输入押金金额"
                          value={stakeAmount}
                          onChange={(e) => setStakeAmount(e.target.value)}
                        />
                      </div>
                      <Button 
                        className="w-full"
                        onClick={handleMerchantRegister}
                        disabled={loading}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        提交注册
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Merchant;