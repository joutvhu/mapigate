import type { Request, Response } from "express";
import type { ModelCallResult, SingleModelHandler, ProviderRequestContext } from "../../providers/types.js";

export type { ModelCallResult, SingleModelHandler, ProviderRequestContext };

export interface ExecuteSingleModelOptions {
  req: Request;
  res: Response;
  body: any;
  modelStr: string;
  clientFormat: "openai" | "anthropic" | "responses";
  isPanel?: boolean;
  requestId: string;
  startTime: number;
  clientTool: string;
  rawModel: string;
  rtkStats: { compressedTokens: number; tokensSaved: number };
  is1mContext?: boolean;
  reqTag: string;
  apiKeyId?: string;
  apiKeyName?: string;
}
