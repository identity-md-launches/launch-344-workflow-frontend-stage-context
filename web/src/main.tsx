import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import App from './App';
import { loadConfig, type Config } from './config';
import { errorText } from './game';
import './styles.css';
function Root() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState('');
  useEffect(() => { void loadConfig().then(setConfig).catch(e => setError(errorText(e))); }, []);
  if (config) return <App config={config}/>;
  return <main className="startup wrap"><p className="eyebrow">SEPOLIA TEST GAME</p><h1>Doomsday Clock.</h1>{error ? <div role="alert"><h2>Deployment could not be verified.</h2><p>{error}</p><button onClick={() => window.location.reload()}>Reload deployment</button></div> : <p role="status">Loading the attested deployment and contract ABIs…</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Root/>);
