import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSqlDatabaseSync } from './utils/sqlSync';

initSqlDatabaseSync();

createRoot(document.getElementById('root')!).render(<App />);
