import type { MarketData } from './types';
import wind from '../../data/wind_profile.json';
import price from '../../data/dam_price_shape.json';

export const marketData: MarketData = {
  windShares: (wind as { shares: number[][] }).shares,
  priceShape: (price as { shape: number[][] }).shape,
};

export const priceMeta = {
  period: (price as { period: string[] }).period,
  baseloadEurMWh: (price as { baseload_eur_mwh: number }).baseload_eur_mwh,
};
