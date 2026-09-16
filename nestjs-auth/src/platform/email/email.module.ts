import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER_TOKEN } from './email-provider.interface';
import { LocalEmailProvider } from './providers/local-email.provider';
import { NodemailerEmailProvider } from './providers/nodemailer-email.provider';
import { EmailTemplateService } from './templates/email-template.service';

@Global()
@Module({
  providers: [
    EmailTemplateService,
    LocalEmailProvider,
    NodemailerEmailProvider,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      inject: [ConfigService, LocalEmailProvider, NodemailerEmailProvider],
      useFactory: (
        configService: ConfigService,
        localProvider: LocalEmailProvider,
        nodemailerProvider: NodemailerEmailProvider,
      ) => {
        const providerType = configService.get<string>(
          'mail.provider',
          'local',
        );
        if (
          providerType.toLowerCase() === 'smtp' ||
          providerType.toLowerCase() === 'nodemailer'
        ) {
          return nodemailerProvider;
        }
        return localProvider;
      },
    },
  ],
  exports: [EMAIL_PROVIDER_TOKEN, EmailTemplateService],
})
export class EmailModule {}
