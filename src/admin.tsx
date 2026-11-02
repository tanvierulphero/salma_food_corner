import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp.tsx';
import './index.css';

const container = document.getElementById('admin-root');
if (container) {
  const root = createRoot(container);
  root.render(<AdminApp />);
}
