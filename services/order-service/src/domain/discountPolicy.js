// GIẢ ĐỊNH: tài liệu chỉ nói "giảm giá dựa trên score", không nêu mức giảm cụ thể.
// Mức điểm lấy theo dữ liệu hạng của Customer Service: Bronze 10, Silver 100, Gold 500.
// Muốn đổi chính sách giảm giá thì chỉ sửa bảng này.
const TIERS = [
    { minScore: 500, percent: 15 },
    { minScore: 100, percent: 10 },
    { minScore: 10, percent: 5 },
];

function discountPercent(score) {
    const tier = TIERS.find((t) => score >= t.minScore);
    return tier ? tier.percent : 0;
}

module.exports = { discountPercent, TIERS };