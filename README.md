# Trade Coin

실시간 비트코인, 이더리움 시세로 롱숏을 연습하는 모의 무기한 선물 거래 앱입니다.
화면 구성과 디자인은 [hjunhuh/trade](https://github.com/hjunhuh/trade)를 그대로 따릅니다.

모든 거래는 가상 자금으로 이뤄지며 실제 주문은 나가지 않습니다. 계좌는 브라우저(localStorage)에 저장됩니다.

## 기능

- BTC, ETH 실시간 시세와 캔들 차트 (1분, 5분, 15분, 1시간, 4시간, 1일), MA, BB, 거래량
- 롱, 숏, 청산 시장가 주문, 비중 25/50/100%, 레버리지 1x에서 100x
- 코인별 격리 증거금, 청산가 계산과 강제 청산
- 8시간마다(00, 08, 16시 UTC) 펀딩비 0.01%, 주문 수수료 0.05%, 슬리피지 0.01%
- 페이지를 닫아 둔 사이의 시세를 다시 열 때 캔들로 재생해서, 그동안 닿은 청산가와 지난 펀딩을 정산
- 계좌 화면: 평가자산 추이, 보유 포지션, 체결 내역, 초기화
- 한국어, 영어
- 단축키: `L` 또는 `↑` 롱, `S` 또는 `↓` 숏, `C` 청산

## 시세

Binance 공개 시장 데이터(`data-api.binance.vision`, `data-stream.binance.vision`)를 쓰고,
응답이 없으면 Coinbase Exchange 공개 API로 자동 전환합니다. API 키는 필요 없습니다.

## 개발

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm test
pnpm build    # dist/
```

`dist/`는 정적 파일이라 Cloudflare Pages 같은 정적 호스팅에 그대로 올릴 수 있습니다.

## 구조

- `src/lib/market/` 시세 소스(Binance, Coinbase), 재연결 소켓, 실시간 피드
- `src/lib/trading/engine.ts` 주문, 청산, 펀딩 계산 (순수 함수, 테스트 포함)
- `src/lib/trading/store.ts` 계좌 저장, 실시간 청산 확인, 자리 비운 사이 재생
- `src/pages/Trade.tsx`, `src/pages/Account.tsx` 화면
