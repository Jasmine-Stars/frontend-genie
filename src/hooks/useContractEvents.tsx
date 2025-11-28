import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "./useWeb3";
import { useContracts } from "./useContracts";

export const useContractEvents = () => {
  const { provider } = useWeb3();
  const contracts = useContracts();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!provider || !contracts.marketplace) return;

    const setupEventListeners = () => {
      // 监听商品上架事件
      contracts.marketplace?.on(
        "ProductListed",
        (productId, merchant, price, metadata, event) => {
          console.log("ProductListed:", { productId, merchant, price, metadata });
          setEvents(prev => [...prev, {
            type: "ProductListed",
            data: { productId: productId.toString(), merchant, price: ethers.utils.formatEther(price), metadata },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听价格更新事件
      contracts.marketplace?.on(
        "ProductPriceUpdated",
        (productId, oldPrice, newPrice, event) => {
          console.log("ProductPriceUpdated:", { productId, oldPrice, newPrice });
          setEvents(prev => [...prev, {
            type: "ProductPriceUpdated",
            data: { 
              productId: productId.toString(), 
              oldPrice: ethers.utils.formatEther(oldPrice), 
              newPrice: ethers.utils.formatEther(newPrice) 
            },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听购买记录事件
      contracts.marketplace?.on(
        "PurchaseRecorded",
        (buyer, merchant, productId, quantity, event) => {
          console.log("PurchaseRecorded:", { buyer, merchant, productId, quantity });
          setEvents(prev => [...prev, {
            type: "PurchaseRecorded",
            data: { buyer, merchant, productId: productId.toString(), quantity: quantity.toString() },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听商户注册事件
      contracts.merchantRegistry?.on(
        "MerchantRegistered",
        (merchant, name, stakeAmount, event) => {
          console.log("MerchantRegistered:", { merchant, name, stakeAmount });
          setEvents(prev => [...prev, {
            type: "MerchantRegistered",
            data: { merchant, name, stakeAmount: ethers.utils.formatEther(stakeAmount) },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听商户状态变更事件
      contracts.merchantRegistry?.on(
        "MerchantStatusChanged",
        (merchant, status, event) => {
          console.log("MerchantStatusChanged:", { merchant, status });
          setEvents(prev => [...prev, {
            type: "MerchantStatusChanged",
            data: { merchant, status: status.toString() },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听慈善积分发放事件
      contracts.beneficiaryModule?.on(
        "CharityTokenGranted",
        (beneficiary, amount, projectId, event) => {
          console.log("CharityTokenGranted:", { beneficiary, amount, projectId });
          setEvents(prev => [...prev, {
            type: "CharityTokenGranted",
            data: { beneficiary, amount: ethers.utils.formatEther(amount), projectId: projectId.toString() },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听慈善积分消费事件
      contracts.beneficiaryModule?.on(
        "CharityTokenSpent",
        (beneficiary, productId, amount, event) => {
          console.log("CharityTokenSpent:", { beneficiary, productId, amount });
          setEvents(prev => [...prev, {
            type: "CharityTokenSpent",
            data: { beneficiary, productId: productId.toString(), amount: ethers.utils.formatEther(amount) },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听NGO注册事件
      contracts.ngoRegistry?.on(
        "NGORegistered",
        (ngoAddr, name, licenseId, stakeAmount, event) => {
          console.log("NGORegistered:", { ngoAddr, name, licenseId, stakeAmount });
          setEvents(prev => [...prev, {
            type: "NGORegistered",
            data: { ngoAddr, name, licenseId, stakeAmount: ethers.utils.formatEther(stakeAmount) },
            timestamp: Date.now()
          }]);
        }
      );

      // 监听NGO审核通过事件
      contracts.ngoRegistry?.on(
        "NGOApproved",
        (ngoAddr, event) => {
          console.log("NGOApproved:", { ngoAddr });
          setEvents(prev => [...prev, {
            type: "NGOApproved",
            data: { ngoAddr },
            timestamp: Date.now()
          }]);
        }
      );
    };

    setupEventListeners();

    return () => {
      // 清除所有监听器
      contracts.marketplace?.removeAllListeners();
      contracts.merchantRegistry?.removeAllListeners();
      contracts.beneficiaryModule?.removeAllListeners();
      contracts.ngoRegistry?.removeAllListeners();
    };
  }, [provider, contracts]);

  return { events };
};
