import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('event_subscription')
export class EventSubscription {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 1000 })
  callback: string;

  @Column({ type: 'text', nullable: true })
  query?: string;

  @CreateDateColumn()
  createdDate: Date;
}
