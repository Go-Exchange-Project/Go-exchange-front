const Header = () => {
  return (
    <header className="h-12 bg-trading-header border-b border-trading-border flex items-center justify-between px-4">
      <div className="flex items-center gap-6">
        <span className="text-primary font-bold text-lg tracking-tight">CoinExchange</span>
        <nav className="flex items-center gap-4 text-sm">
          <span className="text-foreground font-medium cursor-pointer">거래소</span>
          <span className="text-muted-foreground hover:text-foreground cursor-pointer">입출금</span>
          <span className="text-muted-foreground hover:text-foreground cursor-pointer">투자내역</span>
          <span className="text-muted-foreground hover:text-foreground cursor-pointer">코인동향</span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <button className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-medium">
          로그인
        </button>
        <button className="text-xs px-3 py-1.5 rounded border border-trading-border text-muted-foreground hover:text-foreground">
          회원가입
        </button>
      </div>
    </header>
  );
};

export default Header;
