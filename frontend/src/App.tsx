import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import router from './routes';

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
