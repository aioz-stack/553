<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Conversion between display points ("1,250.50") and stored minor units
 * (125050). Never uses floating point.
 */
final class Points
{
    public const SCALE = 100;

    public static function toMinor(string|int $value): int
    {
        $value = str_replace(',', '', trim((string) $value));

        if (! preg_match('/^\d{1,13}(\.\d{1,2})?$/', $value)) {
            throw new InvalidArgumentException('Amount must be a positive number with at most 2 decimals.');
        }

        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '0');

        return ((int) $whole) * self::SCALE + (int) str_pad($fraction, 2, '0');
    }

    public static function format(int $minor): string
    {
        $sign = $minor < 0 ? '-' : '';
        $minor = abs($minor);

        return $sign.number_format(intdiv($minor, self::SCALE)).'.'.str_pad((string) ($minor % self::SCALE), 2, '0', STR_PAD_LEFT);
    }

    /**
     * Plain decimal string without thousands separators (for APIs).
     */
    public static function decimal(int $minor): string
    {
        $sign = $minor < 0 ? '-' : '';
        $minor = abs($minor);

        return $sign.intdiv($minor, self::SCALE).'.'.str_pad((string) ($minor % self::SCALE), 2, '0', STR_PAD_LEFT);
    }
}
