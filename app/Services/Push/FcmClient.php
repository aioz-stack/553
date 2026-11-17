<?php

namespace App\Services\Push;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Minimal Firebase Cloud Messaging HTTP v1 client (no extra packages):
 * signs a service-account JWT (RS256), exchanges it for an OAuth token
 * (cached ~55 min) and sends one message per device token.
 */
class FcmClient
{
    public function configured(): bool
    {
        $path = config('services.fcm.credentials');

        return filled(config('services.fcm.project_id')) && filled($path) && is_readable($path);
    }

    /**
     * @param  array<string, string>  $data
     * @return bool false when the token is no longer valid (caller should forget it)
     */
    public function send(string $deviceToken, string $title, string $body, array $data = []): bool
    {
        if (! $this->configured()) {
            Log::info('push (FCM not configured)', ['title' => $title, 'body' => $body, 'data' => $data]);

            return true;
        }

        $response = Http::withToken($this->accessToken())
            ->acceptJson()
            ->post('https://fcm.googleapis.com/v1/projects/'.config('services.fcm.project_id').'/messages:send', [
                'message' => [
                    'token' => $deviceToken,
                    'notification' => ['title' => $title, 'body' => $body],
                    'data' => array_map('strval', $data),
                    'android' => ['priority' => 'high'],
                    'apns' => ['payload' => ['aps' => ['sound' => 'default']]],
                ],
            ]);

        if ($response->successful()) {
            return true;
        }

        $status = $response->json('error.status');

        if (in_array($status, ['NOT_FOUND', 'UNREGISTERED', 'INVALID_ARGUMENT'], true)) {
            return false;
        }

        Log::warning('FCM send failed', ['status' => $response->status(), 'error' => $response->json('error')]);

        return true;
    }

    private function accessToken(): string
    {
        return Cache::remember('fcm.access_token', 3300, function () {
            $credentials = json_decode((string) file_get_contents(config('services.fcm.credentials')), true);

            if (! isset($credentials['client_email'], $credentials['private_key'])) {
                throw new RuntimeException('FCM credentials file is invalid.');
            }

            $now = time();
            $segments = [
                $this->base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])),
                $this->base64Url(json_encode([
                    'iss' => $credentials['client_email'],
                    'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                    'aud' => 'https://oauth2.googleapis.com/token',
                    'iat' => $now,
                    'exp' => $now + 3600,
                ])),
            ];

            openssl_sign(implode('.', $segments), $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256);
            $jwt = implode('.', [...$segments, $this->base64Url($signature)]);

            return Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ])->throw()->json('access_token');
        });
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
