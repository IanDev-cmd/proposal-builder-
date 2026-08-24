import { createRoot } from 'react-dom/client';

import App from './App';
import { hydrateWorkspace } from './lib/hydrateWorkspace';

import './index.css';

void hydrateWorkspace();

createRoot(document.getElementById('root')!).render(<App />);
