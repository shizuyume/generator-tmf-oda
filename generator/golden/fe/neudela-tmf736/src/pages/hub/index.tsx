import ResourcePage from '../../resource/ResourcePage';
import { config } from './config';

// TMF736 event hub subscriptions (Hub): list, create dialog, remove — from config.ts.
export default function HubPage() {
  return <ResourcePage config={config} />;
}
