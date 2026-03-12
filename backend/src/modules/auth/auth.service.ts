import { prisma } from '../../config/db';
import { verifyMetamaskSignature } from '../../utils/web3';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';

// Ambil atau buat nonce untuk wallet address
export const getNonce = async (walletAddress: string): Promise<string> => {
  const address = walletAddress.toLowerCase();

  let user = await prisma.user.findUnique({
    where: { walletAddress: address },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress: address,
        nonce: uuidv4(),
      },
    });
  }

  return user.nonce;
};

export const loginWithWallet = async (
  walletAddress: string,
  signature: string,
) => {
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
  });

  if (!user) throw new Error('User not found. Please request nonce first.');
  if (!user.isRegistered) throw new Error('User not registered. Please register first.');

  const message = `Sign this message to authenticate.\nNonce: ${user.nonce}`;

  const isValid = verifyMetamaskSignature(address, signature, message);
  if (!isValid) throw new Error('Invalid signature');

  // Rotate nonce setelah login (mencegah replay attack)
  const updatedUser = await prisma.user.update({
    where: { walletAddress: address },
    data: { nonce: uuidv4() },
  });

  const token = jwt.sign(
    { userId: updatedUser.id, walletAddress: updatedUser.walletAddress },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );

  return { user: updatedUser, token };
};

export const registerUser = async (
  walletAddress: string,
  signature: string,
  data: { username?: string; email?: string; avatarUrl?: string },
) => {
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
  });

  if (!user) throw new Error('User not found. Please request nonce first.');
  if (user.isRegistered) throw new Error('User already registered.');

  const message = `Sign this message to register.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  if (!isValid) throw new Error('Invalid signature');

  if (data.username) {
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) throw new Error('Username already taken.');
  }

  if (data.email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) throw new Error('Email already in use.');
  }

  const updatedUser = await prisma.user.update({
    where: { walletAddress: address },
    data: {
      ...data,
      nonce: uuidv4(),
      isRegistered: true,
    },
  });

  const token = jwt.sign(
    { userId: updatedUser.id, walletAddress: updatedUser.walletAddress },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );

  return { user: updatedUser, token };
};