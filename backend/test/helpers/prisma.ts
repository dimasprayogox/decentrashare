import { mock } from 'bun:test';

const modelNames = [
  'user',
  'folder',
  'document',
  'folderAccess',
  'documentAccess',
  'activityLog',
] as const;

const methodNames = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'count',
] as const;

export type PrismaMock = ReturnType<typeof createPrismaMock>;

export function createPrismaMock() {
  const prisma: Record<string, any> = {};

  for (const model of modelNames) {
    prisma[model] = {};
    for (const method of methodNames) {
      prisma[model][method] = mock();
    }
  }

  prisma.$connect = mock(async () => undefined);
  prisma.$disconnect = mock(async () => undefined);
  prisma.$queryRaw = mock(async () => [{ '?column?': 1 }]);
  prisma.$transaction = mock(async (input: any) => {
    if (typeof input === 'function') return input(prisma);
    return Promise.all(input);
  });

  return prisma;
}

export function resetPrismaMock(prisma: PrismaMock) {
  for (const model of modelNames) {
    for (const method of methodNames) {
      prisma[model][method].mockReset();
    }
  }
  prisma.$connect.mockReset();
  prisma.$disconnect.mockReset();
  prisma.$queryRaw.mockReset();
  prisma.$transaction.mockReset();
  prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  prisma.$transaction.mockImplementation(async (input: any) => {
    if (typeof input === 'function') return input(prisma);
    return Promise.all(input);
  });
}
