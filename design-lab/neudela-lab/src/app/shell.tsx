// Shell of this app: brand, theme storage key and the sidebar pages (in order).
import type { ComponentType, ReactNode } from 'react';
import { BellRing, LayoutDashboard, Percent } from 'lucide-react';
import OverviewPage from '../pages/overview';
import PartyRevSharingAlgorithm from '../exposes/PartyRevSharingAlgorithm';
import Hub from '../exposes/Hub';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  page: ComponentType;
  /** Re-clicking the nav item remounts the page (back from the detail view to the list). */
  remountOnNav: boolean;
}

export const BRAND = {
  logoLetter: 'N',
  title: 'Neudela Lab',
  caption: 'TMF736 Revenue Sharing Algorithm Management',
};

export const THEME_STORAGE_KEY = 'neudela-lab:theme';

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', icon: <LayoutDashboard size={18} />, page: OverviewPage, remountOnNav: false },
  { path: '/party-rev-sharing-algorithm', label: 'Revenue Sharing Algorithms', icon: <Percent size={18} />, page: PartyRevSharingAlgorithm, remountOnNav: true },
  { path: '/hub', label: 'Event Hub', icon: <BellRing size={18} />, page: Hub, remountOnNav: true },
];
