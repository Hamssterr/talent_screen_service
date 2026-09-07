import { Global, Module } from '@nestjs/common';
import { CLOCK_TOKEN } from './clock.interface';
import { SystemClock } from './system-clock';

@Global()
@Module({
  providers: [
    {
      provide: CLOCK_TOKEN,
      useClass: SystemClock,
    },
    SystemClock,
  ],
  exports: [CLOCK_TOKEN, SystemClock],
})
export class TimeModule {}
