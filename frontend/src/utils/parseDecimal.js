export const parseDecimal = (value) => {
    const text = String(value ?? '').trim().replace(/\s/g, '')
    if (!text) return NaN

    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const groupingSeparator = decimalSeparator === ',' ? '.' : ','
    const normalized = text
        .replaceAll(groupingSeparator, '')
        .replace(decimalSeparator, '.')

    if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return NaN
    return Number(normalized)
}
