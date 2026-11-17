import React, { useState } from 'react';
import { Lock, LogIn, ShieldCheck, UserCheck, Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  schoolName: string;
  agencyName: string;
  onGoogleLogin: () => Promise<void>;
  onLocalLogin: (username: string, password: string) => Promise<void>;
  authError: string | null;
  isLoading: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  schoolName,
  agencyName,
  onGoogleLogin,
  onLocalLogin,
  authError,
  isLoading,
}) => {
  const isOnline = useOnlineStatus();
  const [mode, setMode] = useState<'google' | 'local'>('google');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await onLocalLogin(username.trim(), password);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <span className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Sổ Phụ Cấp Sân Bãi
          </span>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Trực tuyến</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                  <span>Ngoại tuyến</span>
                </>
              )}
            </span>
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
          <div className="md:col-span-6 flex flex-col justify-center pr-0 md:pr-6">
            <p className="text-xs font-medium text-emerald-800 tracking-wide">
              {agencyName}
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 leading-tight text-balance">
              Quản lý phụ cấp tiết dạy ngoài trời
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Dành cho giáo viên môn <strong>Giáo dục Thể chất</strong> và{' '}
              <strong>Giáo dục Quốc phòng An ninh</strong> tại {schoolName}. Vui lòng đăng nhập
              để thực hiện thống kê giờ dạy, chỉnh sửa bảng kê và in ấn hồ sơ theo mẫu chuẩn.
            </p>

            <div className="mt-8 space-y-4 border-t border-slate-200 pt-6 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-slate-900">Phân quyền & đồng bộ đám mây</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tự động nhận diện chức vụ, lớp dạy từ danh sách nhân sự và sao lưu song song trên
                    Firestore lẫn bộ nhớ thiết bị.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserCheck className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-slate-900">Tính công tự động & xuất PDF/Excel</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Quy đổi chuẩn 2 tiết/lớp (GDTC), 1 tiết/lớp (GDQPAN), tự động trừ tuần nghỉ Tết
                    và xuất bảng kê A4 chuẩn hành chính.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-6 bg-white border border-slate-200 rounded-xl p-6 md:p-8 flex flex-col justify-center">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => setMode('google')}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'google'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tài khoản Google
              </button>
              <button
                type="button"
                onClick={() => setMode('local')}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'local'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tài khoản riêng
              </button>
            </div>

            {authError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                {authError}
              </div>
            )}

            {mode === 'google' ? (
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Đăng nhập với Google
                </h2>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  Khuyên dùng để đồng bộ dữ liệu trực tiếp lên Firestore, nhận phân quyền tự động theo
                  email nhân sự và sao lưu giữa nhiều thiết bị.
                </p>

                <button
                  type="button"
                  disabled={isLoading || !isOnline}
                  onClick={() => void onGoogleLogin()}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập bằng Google'}</span>
                </button>

                {!isOnline && (
                  <p className="mt-3 text-xs text-amber-700">
                    Bạn đang ngoại tuyến. Vui lòng chuyển sang tab Tài khoản riêng để đăng nhập cục
                    bộ không cần mạng.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => void handleLocalSubmit(e)} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Đăng nhập tài khoản nội bộ
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Sử dụng tên đăng nhập và mật khẩu đã được Quản trị viên cấp trong danh sách nhân
                    sự (hoạt động cả khi ngoại tuyến).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Tên đăng nhập hoặc Email
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ví dụ: hieunt"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Mật khẩu
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isLoading ? 'Đang kiểm tra...' : 'Đăng nhập'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-3 px-6 text-center text-xs text-slate-500">
        {schoolName} · Hệ thống kê khai phụ cấp tiết dạy ngoài trời
      </footer>
    </div>
  );
};
