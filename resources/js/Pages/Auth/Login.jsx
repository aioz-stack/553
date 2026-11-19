import { useState } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import GuestLayout from '../../Layouts/GuestLayout';
import { useTheme } from '../../lib/ThemeContext';
import { IconEye, IconEyeOff, IconMoon, IconSun } from '../../Components/Icons';

function GridShapes() {
  return (
    <>
      <div className="absolute right-0 top-0 -z-1 w-full max-w-[250px] xl:max-w-[450px]">
        <img src="/images/shape/grid-01.svg" alt="grid" />
      </div>
      <div className="absolute bottom-0 left-0 -z-1 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <img src="/images/shape/grid-01.svg" alt="grid" />
      </div>
    </>
  );
}

const highlights = ['Four-player real-time tables', 'Gold for Single Player, Chips for Multiplayer', 'Provably fair shuffle'];

export default function Login() {
  const { isDark, toggle } = useTheme();
  const { flash } = usePage().props;
  const [showPassword, setShowPassword] = useState(false);

  const { data, setData, post, processing, errors, reset } = useForm({
    username: '',
    password: '',
  });

  const submit = (event) => {
    event.preventDefault();

    post('/login', {
      onFinish: () => reset('password'),
    });
  };

  return (
    <GuestLayout>
      <Head title="Login" />

      <div className="relative z-1 bg-white p-6 dark:bg-gray-900 sm:p-0">
        <div className="relative flex h-screen w-full flex-col justify-center dark:bg-gray-900 sm:p-0 lg:flex-row">
          {/* Form */}
          <div className="flex w-full flex-1 flex-col lg:w-1/2">
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
              <div>
                <div>
                  <div className="mb-5 sm:mb-8">
                    <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">Sign In</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Enter your username and password to play Pusoy 13.</p>
                  </div>

                  {flash?.success && <div className="mb-4 text-sm text-green-600">{flash.success}</div>}
                  {errors.username && <div className="mb-4 text-sm text-red-600">{errors.username}</div>}

                  <form onSubmit={submit}>
                    <div className="space-y-5">
                      {/* Username */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                          Username<span className="text-error-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="username"
                          name="username"
                          value={data.username}
                          onChange={(event) => setData('username', event.target.value)}
                          placeholder="username"
                          className="dark:bg-dark-900 shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                          Password<span className="text-error-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            name="password"
                            id="password"
                            value={data.password}
                            onChange={(event) => setData('password', event.target.value)}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter your password"
                            className="shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-4 pr-11 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                          />
                          <span
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer text-gray-500 dark:text-gray-400"
                          >
                            {showPassword ? <IconEyeOff className="fill-current" /> : <IconEye className="fill-current" />}
                          </span>
                        </div>
                      </div>

                      {/* Button */}
                      <div>
                        <button
                          type="submit"
                          disabled={processing}
                          className="shadow-theme-xs flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-70"
                        >
                          Sign In
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <Link href="/forgot-password" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                          Forgot password?
                        </Link>
                        <span className="text-gray-700 dark:text-gray-400">
                          New here?{' '}
                          <Link href="/register" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                            Create an account
                          </Link>
                        </span>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>

          <div className="relative hidden h-full w-full items-center bg-brand-950 dark:bg-white/5 lg:grid lg:w-1/2">
            <div className="z-1 flex items-center justify-center">
              <GridShapes />
              <div className="flex max-w-xs flex-col items-center">
                <a href="/" className="mb-4 block">
                  <img src="/images/logo/pusoy-icon.svg" alt="Pusoy 13" className="h-20 w-20" />
                </a>
                <h2 className="mb-3 text-center text-title-sm font-bold text-white">Pusoy 13</h2>
                <p className="text-center text-gray-400 dark:text-white/60">
                  Chinese Poker for four. Arrange thirteen cards into Front, Middle and Back — and beat every opponent.
                </p>

                <div className="mt-10 flex flex-wrap justify-center gap-3">
                  {highlights.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Toggler */}
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <button
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="inline-flex size-14 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600"
            >
              <IconSun className={`fill-current ${isDark ? 'block' : 'hidden'}`} />
              <IconMoon className={`fill-current ${isDark ? 'hidden' : 'block'}`} />
            </button>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}
