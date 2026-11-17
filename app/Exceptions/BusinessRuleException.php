<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * A request that is well-formed but violates a business rule
 * (insufficient balance, wrong game state, not your player, ...).
 */
class BusinessRuleException extends RuntimeException
{
    public function __construct(string $message, protected int $status = 422, protected string $errorCode = 'business_rule')
    {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function render(Request $request): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson() || $request->is('api/*')) {
            return response()->json([
                'message' => $this->getMessage(),
                'error' => $this->errorCode,
            ], $this->status);
        }

        return back()->with('error', $this->getMessage());
    }
}
