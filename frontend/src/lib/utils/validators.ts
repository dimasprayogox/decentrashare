export const validators = {
	isEthAddress: (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr),
	isSignature: (sig: string) => /^0x[a-fA-F0-9]{130}$/.test(sig)
};
