// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AttentionBondEscrow
 * @notice Attention Bond mechanism for BaseMail v2
 * @dev Senders escrow USDC when emailing a recipient.
 *      - If recipient replies within the response window → bond refunded (minus protocol fee).
 *      - If no reply → bond forfeited to recipient after the window expires.
 *      - Whitelisted senders are exempt from bonding.
 *
 * Reference: "Connection-Oriented Quadratic Attention Funding"
 *            Ko, Tang, Weyl (2026)
 */
contract AttentionBondEscrow {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    // Constants & Immutables
    // ──────────────────────────────────────────────

    IERC20 public immutable usdc;
    address public owner;
    
    /// @notice Protocol fee in basis points (100 = 1%)
    uint256 public protocolFeeBps = 1000; // 10%
    
    /// @notice Default response window (7 days)
    uint256 public constant DEFAULT_RESPONSE_WINDOW = 7 days;

    /// @notice Minimum bond amount (0.001 USDC = 1000 units with 6 decimals)
    uint256 public constant MIN_BOND = 1000; // 0.001 USDC

    /// @notice Protocol treasury
    address public treasury;

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

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

    /// @notice emailId (bytes32) → Bond
    mapping(bytes32 => Bond) public bonds;

    /// @notice Recipient attention price (base price in USDC smallest unit)
    /// @dev 0 means use global default (10000 = 0.01 USDC)
    mapping(address => uint256) public attentionPrice;

    /// @notice Default attention price for accounts that haven't set one
    uint256 public defaultAttentionPrice = 10000; // 0.01 USDC

    /// @notice recipient → sender → whitelisted
    mapping(address => mapping(address => bool)) public whitelist;

    /// @notice Recipient custom response window (0 = use default)
    mapping(address => uint256) public responseWindow;

    /// @notice Total bonds deposited (for stats)
    uint256 public totalBondsDeposited;
    uint256 public totalBondsRefunded;
    uint256 public totalBondsForfeited;
    uint256 public totalProtocolFees;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event BondDeposited(
        bytes32 indexed emailId,
        address indexed sender,
        address indexed recipient,
        uint256 amount
    );

    event BondRefunded(
        bytes32 indexed emailId,
        address indexed sender,
        address indexed recipient,
        uint256 refundAmount,
        uint256 protocolFee
    );

    event BondForfeited(
        bytes32 indexed emailId,
        address indexed sender,
        address indexed recipient,
        uint256 amount
    );

    event AttentionPriceSet(address indexed account, uint256 price);
    event WhitelistUpdated(address indexed recipient, address indexed sender, bool status);
    event ResponseWindowSet(address indexed account, uint256 window);

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _usdc USDC token address on Base
    /// @param _treasury Protocol fee recipient
    constructor(address _usdc, address _treasury) {
        usdc = IERC20(_usdc);
        treasury = _treasury;
        owner = msg.sender;
    }

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Deposit an attention bond when sending an email
     * @param _recipient Recipient's wallet address
     * @param _emailId Unique email identifier (hashed off-chain)
     * @param _amount Bond amount in USDC (smallest unit, 6 decimals)
     * @dev Sender must have approved this contract for _amount USDC
     */
    function deposit(
        address _recipient,
        bytes32 _emailId,
        uint256 _amount
    ) external {
        require(_recipient != address(0), "Invalid recipient");
        require(_recipient != msg.sender, "Cannot bond to self");
        require(bonds[_emailId].sender == address(0), "Bond already exists");
        require(_amount >= MIN_BOND, "Below minimum bond");

        // Check if sender is whitelisted (no bond needed)
        require(!whitelist[_recipient][msg.sender], "Sender is whitelisted, no bond needed");

        // Check minimum attention price
        uint256 minPrice = getAttentionPrice(_recipient);
        require(_amount >= minPrice, "Below attention price");

        // Transfer USDC from sender to this contract
        usdc.safeTransferFrom(msg.sender, address(this), _amount);

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

    /**
     * @notice Recipient replies → refund bond to sender (minus protocol fee)
     * @param _emailId The email being replied to
     * @dev Only callable by the recipient (or their authorized agent)
     */
    function reply(bytes32 _emailId) external {
        Bond storage bond = bonds[_emailId];
        require(bond.sender != address(0), "Bond not found");
        require(bond.status == BondStatus.Active, "Bond not active");
        require(msg.sender == bond.recipient, "Not recipient");

        bond.status = BondStatus.Refunded;

        uint256 fee = (bond.amount * protocolFeeBps) / 10000;
        uint256 refund = bond.amount - fee;

        // Refund to sender
        usdc.safeTransfer(bond.sender, refund);
        // Protocol fee to treasury
        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
        }

        totalBondsRefunded += refund;
        totalProtocolFees += fee;

        emit BondRefunded(_emailId, bond.sender, bond.recipient, refund, fee);
    }

    /**
     * @notice Forfeit bond after response window expires (no reply)
     * @param _emailId The unreplied email
     * @dev Callable by anyone after the window expires
     */
    function forfeit(bytes32 _emailId) external {
        Bond storage bond = bonds[_emailId];
        require(bond.sender != address(0), "Bond not found");
        require(bond.status == BondStatus.Active, "Bond not active");
        require(
            block.timestamp >= bond.depositTime + bond.responseWindow,
            "Response window not expired"
        );

        bond.status = BondStatus.Forfeited;

        // Transfer entire bond to recipient (spam tax)
        usdc.safeTransfer(bond.recipient, bond.amount);

        totalBondsForfeited += bond.amount;

        emit BondForfeited(_emailId, bond.sender, bond.recipient, bond.amount);
    }

    // ──────────────────────────────────────────────
    // Configuration
    // ──────────────────────────────────────────────

    /**
     * @notice Set your attention price (minimum bond to email you)
     * @param _price Price in USDC smallest unit (0 = use default)
     */
    function setAttentionPrice(uint256 _price) external {
        attentionPrice[msg.sender] = _price;
        emit AttentionPriceSet(msg.sender, _price);
    }

    /**
     * @notice Add or remove a sender from your whitelist
     * @param _sender Sender to whitelist/unwhitelist
     * @param _status true = whitelisted (no bond needed), false = removed
     */
    function setWhitelist(address _sender, bool _status) external {
        whitelist[msg.sender][_sender] = _status;
        emit WhitelistUpdated(msg.sender, _sender, _status);
    }

    /**
     * @notice Set custom response window
     * @param _window Window in seconds (0 = use default 7 days)
     */
    function setResponseWindow(uint256 _window) external {
        require(_window == 0 || _window >= 1 days, "Min 1 day");
        require(_window <= 30 days, "Max 30 days");
        responseWindow[msg.sender] = _window;
        emit ResponseWindowSet(msg.sender, _window);
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get the current attention price for a recipient
     * @param _recipient Recipient address
     * @return price in USDC smallest unit
     */
    function getAttentionPrice(address _recipient) public view returns (uint256) {
        uint256 price = attentionPrice[_recipient];
        return price > 0 ? price : defaultAttentionPrice;
    }

    /**
     * @notice Check if a sender is whitelisted by a recipient
     */
    function isWhitelisted(address _recipient, address _sender) external view returns (bool) {
        return whitelist[_recipient][_sender];
    }

    /**
     * @notice Get bond details
     */
    function getBond(bytes32 _emailId) external view returns (
        address sender,
        address recipient,
        uint256 amount,
        uint256 depositTime,
        uint256 responseWindowEnd,
        BondStatus status
    ) {
        Bond memory bond = bonds[_emailId];
        return (
            bond.sender,
            bond.recipient,
            bond.amount,
            bond.depositTime,
            bond.depositTime + bond.responseWindow,
            bond.status
        );
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

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
