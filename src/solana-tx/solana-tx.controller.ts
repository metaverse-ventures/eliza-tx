import { Controller, Post, Body, Req } from '@nestjs/common';
import { SolanaTxService } from './solana-tx.service';
import { TransferDTO } from './dto/transfer.dto';

@Controller('solana-tx')
export class SolanaTxController {
  constructor(private readonly solanaTxService: SolanaTxService) {}

  @Post('transfer')
  transfer(@Req() req: Request, @Body() transferDTO: TransferDTO) {
    const authToken = req['authToken'];
    return this.solanaTxService.transfer(transferDTO, authToken);
  }
}
