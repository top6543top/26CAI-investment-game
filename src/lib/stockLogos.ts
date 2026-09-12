// 학교별 로고 이미지가 준비되면 /public/logos/<종목명>.jpg로 넣고 여기에 등록하면 자동 적용됨.
const LOGOS: Record<string, string> = {}

export function logoForStock(name: string): string | undefined {
  return LOGOS[name]
}
