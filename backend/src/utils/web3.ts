import { ethers } from 'ethers';

export const verifyMetamaskSignature = (
  address: string,
  signature: string,
  message: string
): boolean => {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    return false;
  }
};