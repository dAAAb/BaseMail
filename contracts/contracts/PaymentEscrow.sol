// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PaymentEscrow
 * @notice USDC escrow for BaseMail external email payments.
 *         Sender deposits USDC tied to a claim ID. Recipient claims via
 *         the BaseMail worker (owner), which releases funds after verifying
 *         the claimer has a BaseMail account.
 *
 *         - deposit(): sender escrows USDC (indexed by claim_id)
 *         - release(): owner sends escrowed USDC to claimer's wallet
 *         - refund():  sender reclaims after expiry
 */
contract PaymentEscrow {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public owner;

    uint256 public constant MIN_AMOUNT = 100_000; // 0.10 USDC (6 decimals)

    struct Deposit {
        address sender;
        uint256 amount;
        uint256 expiry;     // unix timestamp
        bool settled;       // released or refunded
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

    /// @notice Deposit USDC into escrow for a claim
    /// @param claimId Unique claim identifier (hash of claim_id string)
    /// @param amount  USDC amount (6 decimals)
    /// @param expiry  Unix timestamp after which sender can refund
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

    /// @notice Release escrowed USDC to claimer (only owner / BaseMail worker)
    /// @param claimId Claim identifier
    /// @param claimer Wallet to receive the USDC
    function release(bytes32 claimId, address claimer) external onlyOwner {
        Deposit storage d = deposits[claimId];
        require(d.sender != address(0), "Deposit not found");
        require(!d.settled, "Already settled");

        d.settled = true;
        usdc.safeTransfer(claimer, d.amount);
        emit Released(claimId, claimer, d.amount);
    }

    /// @notice Refund expired deposit back to sender
    /// @param claimId Claim identifier
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

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice View deposit details
    function getDeposit(bytes32 claimId) external view returns (
        address sender, uint256 amount, uint256 expiry, bool settled
    ) {
        Deposit memory d = deposits[claimId];
        return (d.sender, d.amount, d.expiry, d.settled);
    }
}
