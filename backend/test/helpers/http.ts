import { mock } from 'bun:test';

export function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status: mock((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: mock((payload: unknown) => {
      res.body = payload;
      return res;
    }),
    setHeader: mock((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
    end: mock(() => res),
  };

  return res;
}

export function createMockNext() {
  return mock(() => undefined);
}
