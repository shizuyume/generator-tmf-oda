import { createProtectedPage } from '../federation/createProtectedPage';

export default createProtectedPage(() => import('../pages/hub'), {
  pageName: 'Hub',
});
