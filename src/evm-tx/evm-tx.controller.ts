import { Body, Controller, Post, Req } from '@nestjs/common';
import { EvmTxService } from './evm-tx.service';
import { BridgePayloadDTO, TransferDTO } from './dto/create-evm-tx.dto';
import { IResponse } from 'src/_common/utils/interface';

@Controller('evm-tx')
export class EvmTxController {

  constructor(private readonly evmTxService: EvmTxService) { }

  @Post('transfer')
  transfer(
    @Req() req: Request,
    @Body() transferDTO: TransferDTO,
  ): Promise<IResponse> {
    const authToken = req['authToken'];
    return this.evmTxService.transfer(transferDTO, authToken)
  }

  @Post('bridge')
  bridge(
    @Req() req: Request,
    @Body() BridgePayloadDTO: BridgePayloadDTO,
  ): Promise<IResponse> {
    const authToken = req['authToken'];
    return this.evmTxService.bridge(BridgePayloadDTO, authToken)
  }

}
