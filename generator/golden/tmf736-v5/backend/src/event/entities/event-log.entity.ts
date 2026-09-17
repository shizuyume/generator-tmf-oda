import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('event_log')
export class EventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  resourceId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resourceType?: string;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;
}
