import { createProtectedPage } from '../federation/createProtectedPage';

export default createProtectedPage(() => import('../pages/party-rev-sharing-algorithm'), {
  pageName: 'PartyRevSharingAlgorithm',
});
