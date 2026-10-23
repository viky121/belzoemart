import { Global, Module } from '@nestjs/common';
import { ResilientHttpService } from './resilient-http.service';

@Global()
@Module({
  providers: [ResilientHttpService],
  exports: [ResilientHttpService],
})
export class HttpModule {}
