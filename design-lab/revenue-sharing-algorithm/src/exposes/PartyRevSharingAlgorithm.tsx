import { createProtectedPage } from '../federation/createProtectedPage';

// TODO: CUSTOMIZE — page path + pageName per TMF resource
export default createProtectedPage(() => import('../pages/party-rev-sharing-algorithm'), {
  pageName: 'PartyRevSharingAlgorithm',
});
