import React, { useState, useMemo, useEffect } from "react";
import { useHistory } from "react-router";
import classNames from "classnames";
import Styles from "./liquidity-view.styles.less";
import {
  Components,
  Utils,
  useDataStore,
  useUserStore,
  Constants,
  ContractCalls,
  Stores,
  useScrollToTopOnMount,
} from "@augurproject/comps";
import { AppViewStats, AvailableLiquidityRewards, MaticAddMetaMaskToken } from "../common/labels";
import {
  categoryItems,
  MARKET_LIQUIDITY,
  ZERO,
  MARKET_TYPE_OPTIONS,
  POOL_SORT_TYPES,
  POOL_SORT_TYPE_TEXT,
} from "../constants";
import { BonusReward } from "../common/tables";
import { useSimplifiedStore } from "../stores/simplified";
import { MarketInfo } from "@augurproject/comps/build/types";
import BigNumber from "bignumber.js";
import { SubCategoriesFilter } from "../markets/markets-view";

const { ADD, CREATE, REMOVE, ALL_MARKETS, OTHER, POPULAR_CATEGORIES_ICONS, SPORTS, MARKET_ID_PARAM_NAME } = Constants;
const {
  PaginationComps: { sliceByPage, useQueryPagination, Pagination },
  Links: { MarketLink },
  SelectionComps: { SquareDropdown, ToggleSwitch },
  Icons: { Arrow, MaticIcon },
  InputComps: { SearchInput },
  LabelComps: { CategoryIcon },
  MarketCardComps: { MarketTitleArea },
  ButtonComps: { PrimaryThemeButton, SecondaryThemeButton },
} = Components;
const { canAddLiquidity, getMaticUsdPrice } = ContractCalls;
const {
  DateUtils: { getMarketEndtimeDate },
  Formatter: { formatApy, formatCash, formatToken },
  PathUtils: { makeQuery, makePath },
} = Utils;
const {
  Utils: { isMarketFinal },
} = Stores;

const PAGE_LIMIT = 50;

interface LiquidityMarketCardProps {
  key?: string;
  market: MarketInfo;
}

const applyFiltersAndSort = (
  passedInMarkets,
  setFilteredMarkets,
  transactions,
  lpTokens,
  pendingRewards,
  { filter, primaryCategory, subCategories, marketTypeFilter, sortBy, onlyUserLiquidity }
) => {
  let updatedFilteredMarkets = passedInMarkets;
  const userMarkets = Object.keys(lpTokens);
  // remove resolved markets unless we have liquidity.
  updatedFilteredMarkets = updatedFilteredMarkets.filter((market) =>
    market.hasWinner ? (userMarkets.includes(market.marketId) ? true : false) : true
  );

  if (onlyUserLiquidity) {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) => userMarkets.includes(market.marketId));
  }

  if (marketTypeFilter !== MARKET_TYPE_OPTIONS[0].value) {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) =>
      marketTypeFilter === MARKET_TYPE_OPTIONS[1].value ? !market.isGrouped : market.isGrouped
    );
  }

  if (filter !== "") {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) => {
      const { title, description, categories, outcomes } = market;
      const searchRegex = new RegExp(filter, "i");
      const matchTitle = searchRegex.test(title);
      const matchDescription = searchRegex.test(description);
      const matchCategories = searchRegex.test(JSON.stringify(categories));
      const matchOutcomes = searchRegex.test(JSON.stringify(outcomes.map((outcome) => outcome.name)));
      if (matchTitle || matchDescription || matchCategories || matchOutcomes) {
        return true;
      }
      return false;
    });
  }

  updatedFilteredMarkets = updatedFilteredMarkets.filter((market: MarketInfo) => {
    if (
      primaryCategory !== ALL_MARKETS &&
      primaryCategory !== OTHER &&
      market.categories[0].toLowerCase() !== primaryCategory.toLowerCase()
    ) {
      return false;
    }
    if (primaryCategory === OTHER && POPULAR_CATEGORIES_ICONS[market.categories[0].toLowerCase()]) {
      return false;
    }
    if (primaryCategory === SPORTS && subCategories.length > 0) {
      // subCategories is always a max 2 length, markets are 3.
      const indexToCheck = subCategories.length === 1 ? 1 : market.categories.length - 1;
      if (
        market.categories[indexToCheck] &&
        market.categories[indexToCheck].toLowerCase() !== subCategories[indexToCheck - 1].toLowerCase()
      ) {
        return false;
      }
    }
    return true;
  });

  if (sortBy.type) {
    updatedFilteredMarkets = updatedFilteredMarkets.sort((marketA, marketB) => {
      const aLiquidity = marketA?.amm?.liquidityUSD;
      const bLiquidity = marketB?.amm?.liquidityUSD;
      const aTransactions = transactions ? transactions[marketA.marketId] : {};
      const bTransactions = transactions ? transactions[marketB.marketId] : {};
      const aUserLiquidity = Number(lpTokens?.[marketA.marketId]?.usdValue) || 0;
      const bUserLiquidity = Number(lpTokens?.[marketB.marketId]?.usdValue) || 0;
      const aUserRewards = Number(pendingRewards?.[marketA.marketId]?.balance) || 0;
      const bUserRewards = Number(pendingRewards?.[marketB.marketId]?.balance) || 0;

      const { type, direction } = sortBy;

      switch (type) {
        case POOL_SORT_TYPES.EXPIRES: {
          return Number(marketA.endTimestamp) < Number(marketB.endTimestamp) ? direction : direction * -1;
        }
        case POOL_SORT_TYPES.APR: {
          return (Number(bTransactions?.apy) || 0) > (Number(aTransactions?.apy) || 0) ? direction : direction * -1;
        }
        case POOL_SORT_TYPES.TVL: {
          return (bLiquidity || 0) > (aLiquidity || 0) ? direction : direction * -1;
        }
        case POOL_SORT_TYPES.LIQUIDITY: {
          return aUserLiquidity < bUserLiquidity ? direction : direction * -1;
        }
        case POOL_SORT_TYPES.REWARDS: {
          return aUserRewards < bUserRewards ? direction : direction * -1;
        }
        default:
          return 0;
      }
    });
  }

  setFilteredMarkets(updatedFilteredMarkets);
};

const LiquidityMarketCard = ({ market }: LiquidityMarketCardProps): React.FC => {
  const {
    settings: { timeFormat },
  } = useSimplifiedStore();
  const {
    balances: { lpTokens, pendingRewards },
    loginAccount,
  } = useUserStore();
  const { transactions } = useDataStore();
  const {
    marketId,
    categories,
    amm: {
      hasLiquidity,
      cash: { name: currency },
      liquidityUSD,
    },
    endTimestamp,
    rewards,
  } = market;

  const marketTransactions = transactions[marketId];
  const formattedApy = useMemo(() => marketTransactions?.apy && formatApy(marketTransactions.apy).full, [
    marketTransactions?.apy,
  ]);
  const formattedTVL = useMemo(
    () => liquidityUSD && formatCash(liquidityUSD, currency, { bigUnitPostfix: true }).full,
    [liquidityUSD]
  );
  const [price, setPrice] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const history = useHistory();
  const userHasLiquidity = lpTokens?.[marketId];
  const canAddLiq = canAddLiquidity(market);
  const isfinal = isMarketFinal(market);
  const pendingUserRewards = (pendingRewards || {})[market.marketId];
  const hasRewards = pendingUserRewards?.pendingBonusRewards && pendingUserRewards?.pendingBonusRewards !== "0";
  const rewardAmount = formatToken(pendingUserRewards?.balance || "0", { decimalsRounded: 2, decimals: 2 });
  useEffect(() => {
    let isMounted = true;
    getMaticUsdPrice(loginAccount?.library).then((p) => {
      if (isMounted) setPrice(p);
    });
    return () => (isMounted = false);
  }, []);
  const rewardsInUsd = formatCash(Number(pendingUserRewards?.balance || "0") * price).formatted;
  return (
    <article
      className={classNames(Styles.LiquidityMarketCard, {
        [Styles.HasUserLiquidity]: userHasLiquidity,
        [Styles.Expanded]: expanded,
        [Styles.Final]: isfinal,
      })}
    >
      <MarketLink id={marketId} dontGoToMarket={false}>
        <CategoryIcon {...{ categories }} />
        <MarketTitleArea {...{ ...market, timeFormat }} />
      </MarketLink>
      <button onClick={() => setExpanded(!expanded)}>
        <CategoryIcon {...{ categories }} />
        <MarketTitleArea {...{ ...market, timeFormat }} />
      </button>
      <span>{endTimestamp ? getMarketEndtimeDate(endTimestamp) : "-"}</span>
      <span>{formattedTVL || "-"}</span>
      <span>{formattedApy || "-"}</span>
      <span>
        {userHasLiquidity ? formatCash(userHasLiquidity?.usdValue, currency).full : "$0.00"}
        {/* {userHasLiquidity && <span>Init Value {formatCash(userHasLiquidity?.usdValue, currency).full}</span>} */}
      </span>
      <span>
        {rewardAmount.formatted} wMATIC
        {userHasLiquidity && <span>(${rewardsInUsd})</span>}
      </span>
      <div>
        <div className={Styles.MobileLabel}>
          <span>My Liquidity</span>
          <span>{userHasLiquidity ? formatCash(userHasLiquidity?.usdValue, currency).full : "$0.00"}</span>
          {/* <span>init. value {formatCash(userHasLiquidity?.initCostUsd, currency).full}</span> */}
        </div>
        <div className={Styles.MobileLabel}>
          <span>My Rewards</span>
          <span>
            {rewardAmount.formatted} {MaticIcon}
          </span>
          <span>(${rewardsInUsd})</span>
        </div>
        {!userHasLiquidity ? (
          <PrimaryThemeButton
            text="ADD LIQUIDITY"
            small
            disabled={!canAddLiq}
            action={() =>
              history.push({
                pathname: makePath(MARKET_LIQUIDITY),
                search: makeQuery({
                  [MARKET_ID_PARAM_NAME]: marketId,
                  [MARKET_LIQUIDITY]: hasLiquidity ? ADD : CREATE,
                }),
              })
            }
          />
        ) : isfinal ? (
          <PrimaryThemeButton
            text="REMOVE LIQUIDITY"
            small
            action={() =>
              history.push({
                pathname: makePath(MARKET_LIQUIDITY),
                search: makeQuery({
                  [MARKET_ID_PARAM_NAME]: marketId,
                  [MARKET_LIQUIDITY]: REMOVE,
                }),
              })
            }
          />
        ) : (
          <>
            <SecondaryThemeButton
              text="-"
              small
              action={() =>
                history.push({
                  pathname: makePath(MARKET_LIQUIDITY),
                  search: makeQuery({
                    [MARKET_ID_PARAM_NAME]: marketId,
                    [MARKET_LIQUIDITY]: REMOVE,
                  }),
                })
              }
            />
            <PrimaryThemeButton
              text="+"
              small
              disabled={isfinal || !canAddLiq}
              action={() =>
                !isfinal &&
                history.push({
                  pathname: makePath(MARKET_LIQUIDITY),
                  search: makeQuery({
                    [MARKET_ID_PARAM_NAME]: marketId,
                    [MARKET_LIQUIDITY]: ADD,
                  }),
                })
              }
            />
          </>
        )}
      </div>
      {hasRewards && <BonusReward pendingBonusRewards={pendingUserRewards} rewardsInfo={rewards} />}
    </article>
  );
};

const LiquidityView = () => {
  const {
    poolsViewSettings,
    actions: { updatePoolsViewSettings },
  } = useSimplifiedStore();
  const {
    balances: { lpTokens, pendingRewards },
  } = useUserStore();
  const { markets, transactions } = useDataStore();
  const { marketTypeFilter, sortBy, primaryCategory, subCategories, onlyUserLiquidity } = poolsViewSettings;

  const [filter, setFilter] = useState("");
  const [filteredMarkets, setFilteredMarkets] = useState([]);
  const [page, setPage] = useQueryPagination({
    itemCount: filteredMarkets.length,
    itemsPerPage: PAGE_LIMIT,
  });
  const marketKeys = Object.keys(markets);
  const userMarkets = Object.keys(lpTokens);
  const rewardBalance =
    pendingRewards && Object.values(pendingRewards).length
      ? String(
          Object.values(pendingRewards).reduce(
            (p: BigNumber, r: { balance: string; earnedBonus: string }) => p.plus(r.balance).plus(r.earnedBonus),
            ZERO
          )
        )
      : "0";
  const handleFilterSort = () => {
    applyFiltersAndSort(Object.values(markets), setFilteredMarkets, transactions, lpTokens, pendingRewards, {
      filter,
      primaryCategory,
      subCategories,
      marketTypeFilter,
      sortBy,
      onlyUserLiquidity,
    });
  };

  useEffect(() => {
    handleFilterSort();
  }, [filter, primaryCategory, subCategories, marketTypeFilter, onlyUserLiquidity, sortBy?.type, sortBy?.direction]);

  useEffect(() => {
    handleFilterSort();
  }, [marketKeys.length, userMarkets.length]);

  useScrollToTopOnMount(page);

  return (
    <div className={Styles.LiquidityView}>
      <AppViewStats small liquidity />
      <AvailableLiquidityRewards balance={rewardBalance} />
      <MaticAddMetaMaskToken />
      <h1>Explore LP Opportunties</h1>
      <p>
        Add Market liquidity to earn fees and rewards. <a href=".">Learn more →</a>
      </p>
      <ul>
        <SquareDropdown
          onChange={(value) => {
            updatePoolsViewSettings({ primaryCategory: value, subCategories: [] });
          }}
          options={categoryItems}
          defaultValue={primaryCategory}
        />
        <SquareDropdown
          onChange={(value) => {
            updatePoolsViewSettings({ marketTypeFilter: value });
          }}
          options={MARKET_TYPE_OPTIONS}
          defaultValue={marketTypeFilter}
        />
        <label html-for="toggleOnlyUserLiquidity">
          <ToggleSwitch
            id="toggleOnlyUserLiquidity"
            toggle={onlyUserLiquidity}
            clean
            setToggle={() => updatePoolsViewSettings({ onlyUserLiquidity: !onlyUserLiquidity })}
          />
          {`My Liquidity Positions ${userMarkets.length > 0 ? `(${userMarkets.length})` : ''}`}
        </label>
        <SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} clearValue={() => setFilter("")} />
      </ul>
      <SubCategoriesFilter
        {...{
          updateCategories: updatePoolsViewSettings,
          subCategories,
          primaryCategory,
        }}
      />
      <section>
        <article>
          <span>Market</span>
          {Object.keys(POOL_SORT_TYPES).map((sortType) => (
            <SortableHeaderButton
              {...{
                sortType,
                setSortBy: (sortBy) => updatePoolsViewSettings({ sortBy }),
                sortBy,
                text: POOL_SORT_TYPE_TEXT[sortType],
                key: `${sortType}-sortable-button`,
              }}
            />
          ))}
          <span />
        </article>
        <section>
          {sliceByPage(filteredMarkets, page, PAGE_LIMIT).map((market: MarketInfo) => (
            <LiquidityMarketCard market={market} key={market.marketId} />
          ))}
        </section>
      </section>
      {filteredMarkets.length > 0 && (
        <Pagination
          page={page}
          useFull
          itemCount={filteredMarkets.length}
          itemsPerPage={PAGE_LIMIT}
          action={(page) => {
            setPage(page);
          }}
          updateLimit={null}
          usePageLocation
        />
      )}
    </div>
  );
};

export default LiquidityView;

interface SortableHeaderButtonProps {
  setSortBy: Function;
  sortBy: { type: string | null; direction: number };
  sortType: string;
  text: string;
  key?: string;
}

const SortableHeaderButton = ({ setSortBy, sortBy, sortType, text }: SortableHeaderButtonProps): React.FC => (
  <button
    className={classNames({
      [Styles.Ascending]: sortBy.direction < 0,
    })}
    onClick={() => {
      switch (sortBy.type) {
        case sortType: {
          setSortBy({
            type: sortBy.direction < 0 ? null : sortType,
            direction: sortBy.direction < 0 ? 1 : -1,
          });
          break;
        }
        default: {
          setSortBy({
            type: sortType,
            direction: 1,
          });
          break;
        }
      }
    }}
  >
    {sortBy.type === sortType && Arrow} {text} {sortType === POOL_SORT_TYPES.REWARDS ? MaticIcon : null}
  </button>
);
