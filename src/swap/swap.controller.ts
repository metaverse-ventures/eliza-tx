import { Body, Controller, Post, Req } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapPayloadDTO } from './dto/swap.dto';

@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post()
  transferSwap(@Req() req: Request, @Body() swapDTO: SwapPayloadDTO) {
    const authToken = req['authToken'];
    return this.swapService.transferSwap(swapDTO, authToken);
  }
}
