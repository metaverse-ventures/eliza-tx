import { Hash } from "viem";
import { IResponse } from "../utils/interface";

export function response(
    status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS', 
    message : string, 
    hash?: string | null | Hash
) {
    const res: IResponse = {
        status,
        message,
        hash
    }
    return res;
}