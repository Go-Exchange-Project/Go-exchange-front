import { NavLink } from "@/components/NavLink";

const Header = () => {
  return (
    <header className="h-12 bg-trading-header border-b border-trading-border flex items-center justify-between px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-primary font-bold text-lg tracking-tight">
          CoinExchange
        </span>
      </div>
      <nav className="flex items-center gap-3 text-sm text-muted-foreground">
        <NavLink
          to="/"
          end
          className="transition-colors hover:text-foreground"
          activeClassName="text-foreground"
        >
          거래
        </NavLink>
        <NavLink
          to="/assets"
          data-testid="nav-assets"
          className="transition-colors hover:text-foreground"
          activeClassName="text-foreground"
        >
          자산
        </NavLink>
      </nav>
    </header>
  );
};

export default Header;
