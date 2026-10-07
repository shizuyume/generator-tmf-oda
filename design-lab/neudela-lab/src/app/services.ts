// Resource collections of this app's API (paths under TMF_BASE, src/app/env.ts).
import { resourceService } from '../service/resource';
import type { Hub, Hub_FVO, PartyRevSharingAlgorithm, PartyRevSharingAlgorithm_FVO, PartyRevSharingAlgorithm_MVO } from '../types';

export const partyRevSharingAlgorithmService = resourceService<PartyRevSharingAlgorithm, PartyRevSharingAlgorithm_FVO, PartyRevSharingAlgorithm_MVO>('/partyRevSharingAlgorithm');
export const hubService = resourceService<Hub, Hub_FVO>('/hub');
