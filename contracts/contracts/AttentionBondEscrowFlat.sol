// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AttentionBondEscrow (Flattened for deployment)
 * @notice Attention Bond mechanism for BaseMail v2
 * @dev Senders escrow USDC when emailing a recipient.
 *      Reply within window → bond refunded (minus protocol fee).
 *      No reply → bond forfeited to recipient.
 *
 * Reference: "Connection-Oriented Quadratic Attention Funding"
 *            Ko, Tang, Weyl (2026)
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AttentionBondEscrow {

    IERC20 public immutable usdc;
    address public owner;
    
    /// @notice Protocol fee in basis points (1000 = 10%)
    uint256 public protocolFeeBps = 1000;
    
    /// @notice Default response window (7 days)
    uint256 public constant DEFAULT_RESPONSE_WINDOW = 7 days;

    /// @notice Minimum bond amount (1000 = 0.001 USDC, 6 decimals)
    uint256 public constant MIN_BOND = 1000;

    /// @notice Protocol treasury
    address public treasury;

    enum BondStatus { Active, Refunded, Forfeited }

    struct Bond {
        address sender;
        address recipient;
        uint256 amount;
        uint256 depositTime;
        uint256 responseWindow;
        bytes32 emailId;
        BondStatus status;
    }

    mapping(bytes32 => Bond) public bonds;
    mapping(address => uint256) public attentionPrice;
    uint256 public defaultAttentionPrice = 10000; // 0.01 USDC
    mapping(address => mapping(address => bool)) public whitelist;
    mapping(address => uint256) public responseWindow;

    uint256 public totalBondsDeposited;
    uint256 public totalBondsRefunded;
    uint256 public totalBondsForfeited;
    uint256 public totalProtocolFees;

    event BondDeposited(bytes32 indexed emailId, address indexed sender, address indexed recipient, uint256 amount);
    event BondRefunded(bytes32 indexed emailId, address indexed sender, address indexed recipient, uint256 refundAmount, uint256 protocolFee);
    event BondForfeited(bytes32 indexed emailId, address indexed sender, address indexed recipient, uint256 amount);
    event AttentionPriceSet(address indexed account, uint256 price);
    event WhitelistUpdated(address indexed recipient, address indexed sender, bool status);
    event ResponseWindowSet(address indexed account, uint256 window);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc, address _treasury) {
        usdc = IERC20(_usdc);
        treasury = _treasury;
        owner = msg.sender;
    }

    function deposit(address _recipient, bytes32 _emailId, uint256 _amount) external {
        require(_recipient != address(0), "Invalid recipient");
        require(_recipient != msg.sender, "Cannot bond to self");
        require(bonds[_emailId].sender == address(0), "Bond already exists");
        require(_amount >= MIN_BOND, "Below minimum bond");
        require(!whitelist[_recipient][msg.sender], "Sender whitelisted");

        uint256 minPrice = getAttentionPrice(_recipient);
        require(_amount >= minPrice, "Below attention price");

        require(usdc.transferFrom(msg.sender, address(this), _amount), "USDC transfer failed");

        uint256 window = responseWindow[_recipient];
        if (window == 0) window = DEFAULT_RESPONSE_WINDOW;

        bonds[_emailId] = Bond({
            sender: msg.sender,
            recipient: _recipient,
            amount: _amount,
            depositTime: block.timestamp,
            responseWindow: window,
            emailId: _emailId,
            status: BondStatus.Active
        });

        totalBondsDeposited += _amount;
        emit BondDeposited(_emailId, msg.sender, _recipient, _amount);
    }

    function reply(bytes32 _emailId) external {
        Bond storage bond = bonds[_emailId];
        require(bond.sender != address(0), "Bond not found");
        require(bond.status == BondStatus.Active, "Bond not active");
        require(msg.sender == bond.recipient, "Not recipient");

        bond.status = BondStatus.Refunded;

        uint256 fee = (bond.amount * protocolFeeBps) / 10000;
        uint256 refund = bond.amount - fee;

        require(usdc.transfer(bond.sender, refund), "Refund failed");
        if (fee > 0) {
            require(usdc.transfer(treasury, fee), "Fee transfer failed");
        }

        totalBondsRefunded += refund;
        totalProtocolFees += fee;
        emit BondRefunded(_emailId, bond.sender, bond.recipient, refund, fee);
    }

    function forfeit(bytes32 _emailId) external {
        Bond storage bond = bonds[_emailId];
        require(bond.sender != address(0), "Bond not found");
        require(bond.status == BondStatus.Active, "Bond not active");
        require(block.timestamp >= bond.depositTime + bond.responseWindow, "Window not expired");

        bond.status = BondStatus.Forfeited;
        require(usdc.transfer(bond.recipient, bond.amount), "Forfeit transfer failed");

        totalBondsForfeited += bond.amount;
        emit BondForfeited(_emailId, bond.sender, bond.recipient, bond.amount);
    }

    function setAttentionPrice(uint256 _price) external {
        attentionPrice[msg.sender] = _price;
        emit AttentionPriceSet(msg.sender, _price);
    }

    function setWhitelist(address _sender, bool _status) external {
        whitelist[msg.sender][_sender] = _status;
        emit WhitelistUpdated(msg.sender, _sender, _status);
    }

    function setResponseWindow(uint256 _window) external {
        require(_window == 0 || _window >= 1 days, "Min 1 day");
        require(_window <= 30 days, "Max 30 days");
        responseWindow[msg.sender] = _window;
        emit ResponseWindowSet(msg.sender, _window);
    }

    function getAttentionPrice(address _recipient) public view returns (uint256) {
        uint256 price = attentionPrice[_recipient];
        return price > 0 ? price : defaultAttentionPrice;
    }

    function isWhitelisted(address _recipient, address _sender) external view returns (bool) {
        return whitelist[_recipient][_sender];
    }

    function getBond(bytes32 _emailId) external view returns (
        address sender, address recipient, uint256 amount,
        uint256 depositTime, uint256 responseWindowEnd, BondStatus status
    ) {
        Bond memory bond = bonds[_emailId];
        return (bond.sender, bond.recipient, bond.amount, bond.depositTime, bond.depositTime + bond.responseWindow, bond.status);
    }

    function setProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 2000, "Max 20%");
        protocolFeeBps = _feeBps;
    }

    function setDefaultAttentionPrice(uint256 _price) external onlyOwner {
        defaultAttentionPrice = _price;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid owner");
        owner = _newOwner;
    }
}
