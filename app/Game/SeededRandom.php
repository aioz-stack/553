<?php

namespace App\Game;

/**
 * Deterministic random integer stream derived from a secret seed using
 * HMAC-SHA256 in counter mode. Uniform via rejection sampling.
 */
final class SeededRandom
{
    private int $counter = 0;

    private string $buffer = '';

    public function __construct(private readonly string $seedHex) {}

    public function intBetween(int $min, int $max): int
    {
        $range = $max - $min + 1;

        if ($range <= 1) {
            return $min;
        }

        // Largest multiple of $range below 2^32 to avoid modulo bias.
        $limit = intdiv(0xFFFFFFFF, $range) * $range;

        do {
            $value = $this->nextUint32();
        } while ($value >= $limit);

        return $min + ($value % $range);
    }

    private function nextUint32(): int
    {
        if (strlen($this->buffer) < 4) {
            $this->buffer .= hash_hmac('sha256', (string) $this->counter++, $this->seedHex, true);
        }

        $chunk = substr($this->buffer, 0, 4);
        $this->buffer = substr($this->buffer, 4);

        return unpack('N', $chunk)[1];
    }
}
