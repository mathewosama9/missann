import { useNavigate } from 'react-router-dom';
import { authApi } from './api';
import { useAuth } from '../../store/auth';

export function useLogout() {
  const navigate = useNavigate();
  return async () => {
    await authApi.logout().catch(() => undefined);
    useAuth.getState().clear();
    navigate('/login', { replace: true });
  };
}
