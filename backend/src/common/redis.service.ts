import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private etatErreur = false;

  constructor(private config: ConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: config.get('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      enableReadyCheck: true,
      lazyConnect: true,
    });

    // ioredis émet en continu des événements « error » quand le serveur est
    // indisponible. Sans listener, Node les considère non gérés et pollue les
    // logs (voire fait craner le process). On journalise les transitions seulement.
    this.client.on('error', (erreur: Error) => {
      if (!this.etatErreur) {
        this.logger.error(`Redis indisponible : ${erreur.message}`);
        this.etatErreur = true;
      }
    });
    this.client.on('ready', () => {
      if (this.etatErreur) {
        this.logger.log('Redis de nouveau disponible.');
        this.etatErreur = false;
      }
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    return this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** SET NX EX : vrai uniquement si la clé n'existait pas encore (anti-replay). */
  async setnx(key: string, seconds: number, value: string): Promise<boolean> {
    const resultat = await this.client.set(key, value, 'EX', seconds, 'NX');
    return resultat === 'OK';
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
