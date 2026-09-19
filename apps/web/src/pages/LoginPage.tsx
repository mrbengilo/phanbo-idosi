import { ArrowRight, Boxes, Eye, EyeOff, LockKeyhole, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ApiClientError, login, mockModeEnabled } from '../lib/api';
import { installAuthenticatedSession, useSession } from '../lib/auth';
import { safeReturnPath } from '../lib/navigation';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const returnPath = safeReturnPath((location.state as { from?: unknown } | null)?.from);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('login') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!username || !password) {
      setError('Nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mockModeEnabled) {
        navigate(returnPath, { replace: true });
        return;
      }
      const session = await login({ username, password });
      installAuthenticatedSession(queryClient, session);
      navigate(returnPath, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Dữ liệu phản hồi không hợp lệ. Vui lòng liên hệ quản trị viên.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!mockModeEnabled && sessionQuery.data) {
    return <Navigate replace to={returnPath} />;
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand">
          <strong>IDOSI</strong>
          <span>QUẢN TRỊ HỆ THỐNG</span>
        </div>
        <div>
          <Boxes aria-hidden="true" size={42} />
          <h1>
            Kho hàng minh bạch.
            <br />
            Phân bổ công bằng.
          </h1>
          <p>
            Theo dõi toàn bộ vòng đời của từng bao hàng — từ nhu cầu, phân bổ đến doanh thu và chứng
            từ kết thúc.
          </p>
        </div>
        <ul>
          <li>Snapshot và phân bổ có thể kiểm toán</li>
          <li>Tồn kho bất biến, đối soát theo sổ cái</li>
          <li>Phân quyền Admin, HTKD và cửa hàng</li>
        </ul>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div>
            <span>Chào mừng trở lại</span>
            <h2>Đăng nhập Kho hàng IDOSI</h2>
            <p>Sử dụng tài khoản được quản trị viên cấp.</p>
          </div>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <label>
            Tên đăng nhập
            <div className="input-with-icon">
              <User aria-hidden="true" size={18} />
              <input autoComplete="username" name="login" placeholder="Tên đăng nhập" />
            </div>
          </label>
          <label>
            Mật khẩu
            <div className="input-with-icon">
              <LockKeyhole aria-hidden="true" size={18} />
              <input
                autoComplete="current-password"
                name="password"
                placeholder="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={18} />
                ) : (
                  <Eye aria-hidden="true" size={18} />
                )}
              </button>
            </div>
          </label>
          <Button busy={busy || (!mockModeEnabled && sessionQuery.isPending)} type="submit">
            Đăng nhập <ArrowRight aria-hidden="true" size={17} />
          </Button>
          <small>
            Nếu quên mật khẩu, liên hệ Admin để đặt lại. Hệ thống không thể xem mật khẩu hiện tại.
          </small>
        </form>
      </section>
    </main>
  );
}
