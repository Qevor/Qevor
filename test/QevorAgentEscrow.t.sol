// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QevorAgentEscrow} from "../contracts/QevorAgentEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
}

contract ReentrantExecutor {
    QevorAgentEscrow private immutable escrow;
    address private immutable account;
    bool public reentrySucceeded;

    constructor(QevorAgentEscrow target, address ownerAccount) {
        escrow = target;
        account = ownerAccount;
    }

    function attack() external {
        escrow.executePayment(keccak256("outer-payment"), account, payable(address(this)), 1 ether);
    }

    receive() external payable {
        (reentrySucceeded,) = address(escrow)
            .call(
                abi.encodeCall(
                    escrow.executePayment,
                    (keccak256("reentrant-payment"), account, payable(address(this)), 1 ether)
                )
            );
    }
}

contract QevorAgentEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    QevorAgentEscrow private escrow;
    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);
    address payable private recipient = payable(address(0xBEEF));

    function setUp() public {
        escrow = new QevorAgentEscrow(address(this), 2 ether, 5 ether);
        vm.deal(address(this), 10 ether);
        escrow.depositFor{value: 10 ether}(address(this));
    }

    function testExecutePaymentRecordsReplayProtection() public {
        bytes32 paymentId = keccak256("payment-1");
        uint256 beforeBalance = recipient.balance;

        escrow.executePayment(paymentId, address(this), recipient, 1 ether);

        require(recipient.balance == beforeBalance + 1 ether, "recipient not paid");
        require(escrow.balances(address(this)) == 9 ether, "account balance not debited");
        require(escrow.executedPayments(paymentId), "payment not recorded");

        (bool replaySucceeded,) =
            address(escrow).call(abi.encodeCall(escrow.executePayment, (paymentId, address(this), recipient, 1 ether)));
        require(!replaySucceeded, "replayed payment succeeded");
    }

    function testDepositsAreScopedToEachAccount() public {
        QevorAgentEscrow scopedEscrow = new QevorAgentEscrow(address(this), 2 ether, 5 ether);
        vm.deal(address(this), 3 ether);

        scopedEscrow.depositFor{value: 1 ether}(alice);
        scopedEscrow.depositFor{value: 2 ether}(bob);

        require(scopedEscrow.balances(alice) == 1 ether, "alice balance wrong");
        require(scopedEscrow.balances(bob) == 2 ether, "bob balance wrong");

        scopedEscrow.executePayment(keccak256("alice-payment"), alice, recipient, 0.5 ether);

        require(scopedEscrow.balances(alice) == 0.5 ether, "alice balance not debited");
        require(scopedEscrow.balances(bob) == 2 ether, "bob balance changed");
    }

    function testCannotSpendAnotherAccountBalance() public {
        QevorAgentEscrow scopedEscrow = new QevorAgentEscrow(address(this), 2 ether, 5 ether);
        vm.deal(address(this), 1 ether);
        scopedEscrow.depositFor{value: 1 ether}(alice);

        (bool succeeded,) =
            address(scopedEscrow).call(abi.encodeCall(scopedEscrow.executePayment, (keccak256("bob-payment"), bob, recipient, 1 ether)));
        require(!succeeded, "bob spent alice balance");
        require(scopedEscrow.balances(alice) == 1 ether, "alice balance changed");
    }

    function testDuplicateBatchRecipientIsBlocked() public {
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = recipient;
        recipients[1] = recipient;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.5 ether;
        amounts[1] = 0.5 ether;

        (bool succeeded,) =
            address(escrow).call(abi.encodeCall(escrow.executeBatch, (keccak256("batch-1"), address(this), recipients, amounts)));
        require(!succeeded, "duplicate batch recipient succeeded");
    }

    function testRecordsBlockedDecision() public {
        bytes32 decisionId = keccak256("decision-1");
        escrow.recordDecision(decisionId, keccak256("payment-2"), recipient, 1 ether, 0, keccak256("blocked"));
        require(escrow.recordedDecisions(decisionId), "decision not recorded");
    }

    function testLinksErc8004Identity() public {
        address identityRegistry = address(0x8004);
        escrow.setAgentIdentity(identityRegistry, 42);
        require(escrow.identityRegistry() == identityRegistry, "registry not linked");
        require(escrow.agentId() == 42, "agent id not linked");
    }

    function testBlocksReentrantExecution() public {
        ReentrantExecutor attacker = new ReentrantExecutor(escrow, address(this));
        escrow.setExecutor(address(attacker));

        attacker.attack();

        require(!attacker.reentrySucceeded(), "reentrant payment succeeded");
        require(address(attacker).balance == 1 ether, "unexpected attacker balance");
        require(!escrow.executedPayments(keccak256("reentrant-payment")), "reentrant payment recorded");
    }
}
