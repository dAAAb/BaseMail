// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Flattened version of PaymentEscrow with inlined OpenZeppelin dependencies

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

library Address {
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }
}

library SafeERC20 {
    using Address for address;

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

/**
 * @title PaymentEscrow
 * @notice USDC escrow for BaseMail external email payments.
 *         Sender deposits USDC tied to a claim ID. Recipient claims via
 *         the BaseMail worker (owner), which releases funds after verifying
 *         the claimer has a BaseMail account.
 */
contract PaymentEscrow {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public owner;

    uint256 public constant MIN_AMOUNT = 100_000; // 0.10 USDC (6 decimals)

    struct Deposit {
        address sender;
        uint256 amount;
        uint256 expiry;
        bool settled;
    }

    mapping(bytes32 => Deposit) public deposits;

    event Deposited(bytes32 indexed claimId, address indexed sender, uint256 amount, uint256 expiry);
    event Released(bytes32 indexed claimId, address indexed claimer, uint256 amount);
    event Refunded(bytes32 indexed claimId, address indexed sender, uint256 amount);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    function deposit(bytes32 claimId, uint256 amount, uint256 expiry) external {
        require(amount >= MIN_AMOUNT, "Below minimum 0.10 USDC");
        require(expiry > block.timestamp, "Expiry must be in the future");
        require(deposits[claimId].sender == address(0), "Claim ID already used");

        deposits[claimId] = Deposit({
            sender: msg.sender,
            amount: amount,
            expiry: expiry,
            settled: false
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(claimId, msg.sender, amount, expiry);
    }

    function release(bytes32 claimId, address claimer) external onlyOwner {
        Deposit storage d = deposits[claimId];
        require(d.sender != address(0), "Deposit not found");
        require(!d.settled, "Already settled");

        d.settled = true;
        usdc.safeTransfer(claimer, d.amount);
        emit Released(claimId, claimer, d.amount);
    }

    function refund(bytes32 claimId) external {
        Deposit storage d = deposits[claimId];
        require(d.sender != address(0), "Deposit not found");
        require(!d.settled, "Already settled");
        require(block.timestamp >= d.expiry, "Not expired yet");
        require(msg.sender == d.sender || msg.sender == owner, "Not authorized");

        d.settled = true;
        usdc.safeTransfer(d.sender, d.amount);
        emit Refunded(claimId, d.sender, d.amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function getDeposit(bytes32 claimId) external view returns (
        address sender, uint256 amount, uint256 expiry, bool settled
    ) {
        Deposit memory d = deposits[claimId];
        return (d.sender, d.amount, d.expiry, d.settled);
    }
}
